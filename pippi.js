angular.module('pippi', [])

.provider('$websocket', {
    websocket: null,
    wsServer: null,
    eventMap: {},
    msgQueue: [],
    callQueue: [],
    callSeq: 0,

    fire: function(eventType, event) {
      // console.log(this.eventMap);
      // console.log(eventType + ":" + event.data);
      if (this.eventMap[eventType]) {
        for (var i = 0; i < this.eventMap[eventType].length; i++) {
          this.eventMap[eventType][i](event);
        }
      }
    },

    call_func: function(Seq, data) {
      console.log("call_func: seq = " + Seq + "; data = ");
      console.log(data);
      console.log("callQueue before call :")
      console.log(this.callQueue);

      TempQueue = [];
      while(this.callQueue.length > 0) {
        Item = this.callQueue.pop();
        if(Item.seq === Seq){
          Item.func(data);
          break;
        }
        else {
          TempQueue.push(Item);
        }
      }
      this.callQueue = TempQueue;
      console.log("callQueue after call :")
      console.log(this.callQueue);
    },

    add_to: function(eventType, handler) {
      //multiple event listener
      if (!this.eventMap[eventType]) {
        this.eventMap[eventType] = [];
      };
      this.eventMap[eventType].push(handler);
      // console.log(eventMap);
    },

    is_onnected: function() {
      if (this.websocket) {
        return this.websocket.readyState ==  this.websocket.OPEN;
      }
      else {
        return false
      }      
    },

    confirm_connect: function(self) {
      if(!self.is_onnected() && self.wsServer) {
        var ws = new WebSocket(self.wsServer);
        ws.onopen = function(evt) {
          console.log("resend msqQueue: ");
          console.log(self.msqQueue);
          while(self.msgQueue.length > 0) {
            ws.send(self.msgQueue.pop())
          };
          self.fire("onOpen", evt)
        };
        ws.onclose   = function(evt) { self.fire("onClose", evt) };
        ws.onerror   = function(evt) { self.fire("onError", evt) };
        ws.onmessage = function(evt) {
          var Res = JSON.parse(evt.data);
          console.log("receive message: ");
          console.log(Res);
          if(Res.length === 3 && Res[0] == 'call_resp')  {
            self.call_func(Res[1], Res[2]);
          }
          else {
            if(Res.length > 1) {
              self.fire("onMessage."+Res[0], {data: Res.slice(1, Res.length)})
            }
            else {
              self.fire("onMessage", evt)
            }
          }
        };
        self.websocket  = ws;
      }
    },

    setServer: function(path) {
      this.wsServer = path;
    },

    $get: function($q) {
      var self = this;
      var Methods = {
        connect : function() {
          self.confirm_connect(self);
        },
        reconnect : function(wsServer) {
          if (self.websocket) {
            self.websocket.close();
          };
          connect(wsServer);
        },
        close : function() {
          if (self.websocket) {
            self.websocket.close();
          }
        },

        onOpen    : function(handler) { this.add_to("onOpen", handler) },
        onClose   : function(handler) { this.add_to("onClose", handler) },
        onError   : function(handler) { this.add_to("onError", handler) },
        onMessage : function(Cmd, handler) { this.add_to("onMessage."+Cmd, handler) },

        cast : function(Msg) {
          if(self.is_onnected()) {
            self.websocket.send(Msg);
          }
          else {
            self.msgQueue.push(Msg);
          }
          self.confirm_connect(self);
        },

        // return a promise object
        // the backend should return any json when success
        // but must return an array and first name is 'error' when failed
        call : function(Cmd) {
          var deferred = $q.defer();
          console.log("call promise: " + Cmd);

          self.callSeq++,
          self.callQueue.push({
            'seq': self.callSeq,
            'func': function(Resp) {
              if(Resp[0] != undefined && Resp[1] === 'error') {
                console.log("promise reject: " + Resp);
                deferred.reject(Resp.slice(1, Resp.length));
              }
              else {
                console.log("promise resolve: " + Resp);
                deferred.resolve(Resp);
              }
          }});
          Command = JSON.stringify(['call', self.callSeq, Cmd]);
          if(self.is_onnected()) {
            self.websocket.send(Command);
          }
          else {
            self.msgQueue.push(Command);
          }
          self.confirm_connect(self);

          return deferred.promise;
        },

        isConnect : function() { return self.is_onnected() },

        clean : function() {
          if (self.websocket) {
            self.websocket.close();
          }
          self.eventMap = {};
        }
      };
      return Methods;
    }
})

.factory('$auth', function($websocket, $q) {
    var loginUser = undefined;

    return {
      user: function() { return loginUser; },
      login: function(User, Pass) {
        var deferred = $q.defer();
        $websocket.call(['login', [User, Pass]])
        .then(
          function(Data) {
            // console.log(User + " login success");
            loginUser = User;
            deferred.resolve(Data);
          },
          function(Reason) {
            // console.log(User + " login failed: " + Reason);
            loginUser = undefined;
            deferred.reject(Reason);
          });
        return deferred.promise;
      },
      logout: function() {
        var deferred = $q.defer();
        $websocket.call(['logout'])
        .then(
          function(Data) {
            loginUser = undefined;
            deferred.resolve(Data)
          },
          function(Reason) {
            deferred.reject(Reason)
          });
        return deferred.promise;
      },
      isOnline: function() {
        if($websocket.isConnect() && loginUser != undefined) {
          // console.log("onine | websocket: " + $websocket.isConnect() + ", loginUser: " + loginUser);
          return true;
        }
        else {
          // console.log("offline | websocket: " + $websocket.isConnect() + ", loginUser: " + loginUser);
          return false;
        }
      }
    }
})

.factory('dynamic_template', function() {
  var meta = {};
  return {
    reg: function(Name, Options) {
      meta[Name] = Options;
    },
    meta: function(Name, Field) {
      return meta[Name][Field];
    },
    columns: function(Name) {
      return meta[Name]['columns'];
    }
  }
})

.directive('pippiGrid', function(dynamic_template) {
  return {
    restrict: 'A',
    scope: {
      options: '='
    },
    controller: function($scope) {
      // selected items

      // update selected and selectAllToggle
      $scope.selectAllToggle = false;
      $scope['selected'] = {};
      $scope.$watch(function() {
        return $scope.options.items;
      }, function(newvalue, oldvalue) {
        if (newvalue !== oldvalue) {
          $scope.selectAllToggle = false;
          $scope['selected'] = {};
        }
      }, true);

      if(!$scope.options.items) {
        $scope.options.items = [];
      }

      $scope.options['selected'] = function() {
        var Selected = [];
        for(var i = 0; i < $scope.options.items.length; i ++) {
          if($scope['selected'][i] === true) {
            Selected.push($scope.options.items[i]);
          }
        }
        return Selected;
      }

      $scope.selectAll = function() {
        var toCheck = $scope.selectAllToggle;
        for(var i = 0; i < $scope.options.items.length; i ++) {
          $scope['selected'][i] = !toCheck;
        }
        $scope.selectAllToggle = !toCheck;
      };

      // pagination
      if(!$scope.options['total']) {
        $scope.options['total'] = 0;
      }
      if(!$scope.options['pages']) {
        $scope.options['pages'] = 0;
      }
      if(!$scope.options['size']) {
        $scope.options['size'] = 10;
      }
      if(!$scope.options['current']) {
        $scope.options['current'] = 1;
      }

      $scope.prev = function() {
        if($scope.options['current'] > 1) {
          $scope.options['current'] -= 1;
          $scope.options.refresh();
        }
      };
      $scope.next = function() {
        if($scope.options['current'] < $scope.options['pages']) {
          $scope.options['current'] += 1;
          $scope.options.refresh();
        }
      };

    },
    // templateUrl: 'components/common/grid.html',
    template: function(ele, attr) {
      var A = [];

      var Columns = dynamic_template.columns(attr.reg);

      // <table class="xxx"></table>
      if(attr.class) {
        A.push('<table class="' + attr.class + '">');
      }
      else {
        A.push('<table>');
      }

      // <thead>...</thead>
      A.push('<thead>');
      // select all
      A.push("<th class='text-center'><input ng-checked='selectAllToggle' ng-click='selectAll()' type='checkbox'></th>");
      // <th>...</th>
      for(var i = 0; i < Columns.length; i ++) {
        A.push('<th class="text-center">' + Columns[i].title + '</th>');
      }
      A.push('</thead>');

      // <tody>...</tbody>
      A.push('<tbody><tr ng-repeat="item in options.items track by $index">');
      // select item
      A.push('<td><input ng-model="selected[$index]" type="checkbox"></td>');
      // <td class="xxx" stye="xxx>...</td>
      for(var i = 0; i < Columns.length; i ++) {
        if(Columns[i]['attr']) {
          A.push('<td ' + Columns[i]['attr'] + '>');
        }
        else {
          A.push('<td>');
        }
        A.push(Columns[i]['template'] + '</td>');
      }
      A.push('</tr></tbody></table>');

      // pagination
      A.push("<div>共{{options['total']}}条记录, ");
      A.push("分{{options['pages']}}页 - ");
      A.push("<a ng-click='prev()'>上一页</a> ");
      A.push("{{options['current']}} ");
      A.push("<a ng-click='next()'>下一页</a>");
      A.push("</div>");

      console.log(A.join(''));
      return A.join('');
    }

  }
});

angular.module('pippi', [])

.provider('$websocket', {
    websocket: null,
    wsServer: null,
    eventMap: {},
    msgQueue: [],
    callQueue: [],
    callSeq: 0,

    fire: function(eventType, event) {
      console.log(this.eventMap);
      console.log(eventType + ":" + event.data);
      if (this.eventMap[eventType]) {
        for (var i = 0; i < this.eventMap[eventType].length; i++) {
          this.eventMap[eventType][i](event);
        }
      }
    },

    call_func: function(Seq, data) {
      console.log("seq: " + Seq, data);
      console.log(this.callQueue);

      TempQueue = [];
      for(var i=0; i < this.callQueue.length; i++) {
        Item = this.callQueue.pop();
        if(Item.seq == Seq){
          Item.func(data);
          this.callQueue.concat(TempQueue);
          break;
        }
        else {
          TempQueue.push(this.callQueue[i]);
        }
      }
      console.log(this.callQueue);
    },

    add_to: function(eventType, handler) {
      //multiple event listener
      if (!this.eventMap[eventType]) {
        this.eventMap[eventType] = [];
      };
      this.eventMap[eventType].push(handler);
      console.log(eventMap);
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
          while(self.msgQueue.length > 0) {
            ws.send(self.msgQueue.pop())
          };
          self.fire("onOpen", evt)
        };
        ws.onclose   = function(evt) { self.fire("onClose", evt) };
        ws.onerror   = function(evt) { self.fire("onError", evt) };
        ws.onmessage = function(evt) {
          var Res = JSON.parse(evt.data);
          if(Res.length == 3 && Res[0] == 'call_resp')  {
            console.log(Res);
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

    $get: function() {
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

        send : function(Msg) {
          if(self.is_onnected()) {
            self.websocket.send(Msg);
          }
          else {
            self.msgQueue.push(Msg);
          }
          self.confirm_connect(self);
        },

        call : function(Cmd, Func) {
          self.callSeq++,
          self.callQueue.push({'seq': self.callSeq, 'func': Func});
          Command = JSON.stringify(['call', self.callSeq, Cmd]);
          if(self.is_onnected()) {
            self.websocket.send(Command);
          }
          else {
            self.msgQueue.push(Command);
          }
          self.confirm_connect(self);
        },

        isConnect : function() { self.is_onnected() },

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

.factory('$auth', function($websocket) {
    return {
      login: function(User, Pass, Func) {
        $websocket.call(['login', [User, Pass]], Func);
      },
      logout: function(Func) {
        $websocket.call(['logout'], Func);
      }
    }
});

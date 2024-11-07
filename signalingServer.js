// signalingServer.js
const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

server.on('connection', socket => {
  socket.on('message', message => {
    // 메시지를 다른 클라이언트에게 전달
    server.clients.forEach(client => {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
});

console.log("WebSocket 시그널링 서버가 ws://localhost:8080에서 실행 중입니다.");

const express = require('express');
const http = require('http'); // 실시간 통신을 위해 내장 http 모듈 추가
const path = require('path');
const { Server } = require('socket.io'); // Socket.io 불러오기

const app = express();
const server = http.createServer(app); // Express를 HTTP 서버로 감싸기
const io = new Server(server); // 서버에 Socket.io 연결

// Render 배포 환경에서는 process.env.PORT를 사용해야 작동합니다.
const PORT = process.env.PORT || 3000; 

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 멀티플레이어 실시간 데이터 관리 ---
const players = {}; // 접속한 유저들의 상태를 저장할 객체

// 유저가 웹사이트에 접속했을 때 발생하는 이벤트
io.on('connection', (socket) => {
    console.log(`새로운 유저 접속: ${socket.id}`);

    // 1. 로그인 화면에서 '입장하기'를 눌렀을 때 (방 입장)
    socket.on('joinRoom', ({ name, room }) => {
        socket.join(room); // 해당 룸 번호(1~9)의 채널로 유저를 그룹화
        
        // 서버에 해당 유저의 초기 데이터 생성
        players[socket.id] = {
            id: socket.id,
            name: name,
            room: room,
            x: 100, y: 300,
            weapon: 'pistol',
            hp: 1250,
            maxHp: 1250,
            isCrouching: false,
            aimAngle: 0,
            vx: 0
        };

        // 방에 있는 '다른 사람들'에게 새로운 유저가 왔다고 알림
        socket.to(room).emit('newPlayer', players[socket.id]);
        
        // 접속한 '본인'에게 현재 방에 있는 모든 유저의 리스트를 전달
        const roomPlayers = Object.values(players).filter(p => p.room === room);
        socket.emit('currentPlayers', roomPlayers);
        
        console.log(`[Room ${room}] ${name} 님이 입장하셨습니다.`);
    });

    // 2. 플레이어가 움직이거나 상태가 변했을 때 (위치, 무기, 숙이기 등)
    socket.on('playerUpdate', (data) => {
        if (players[socket.id]) {
            // 서버의 데이터 갱신
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].weapon = data.weapon;
            players[socket.id].hp = data.hp;
            players[socket.id].isCrouching = data.isCrouching;
            players[socket.id].aimAngle = data.aimAngle;
            players[socket.id].isReloading = data.isReloading;
            players[socket.id].vx = data.vx;

            // 같은 방에 있는 다른 사람들에게 내 변경된 상태를 전달
            socket.to(players[socket.id].room).emit('playerMoved', players[socket.id]);
        }
    });

    // 3. 플레이어가 총을 쐈을 때 (투사체 동기화)
    socket.on('shootBullet', (bulletData) => {
        if (players[socket.id]) {
            // 내가 쏜 총알의 궤적을 같은 방 사람들에게 전송
            socket.to(players[socket.id].room).emit('remoteBullet', bulletData);
        }
    });

    // 4. 게임을 끄거나 새로고침 했을 때 (연결 종료)
    socket.on('disconnect', () => {
        console.log(`유저 접속 종료: ${socket.id}`);
        if (players[socket.id]) {
            const room = players[socket.id].room;
            // 같은 방 사람들에게 해당 유저가 나갔음을 알림 (화면에서 지우기 위함)
            socket.to(room).emit('playerDisconnected', socket.id);
            // 서버에서 유저 데이터 삭제
            delete players[socket.id];
        }
    });
});

// app.listen 대신 server.listen을 사용해야 멀티 서버가 작동합니다.
server.listen(PORT, () => {
    console.log(`스틱맨 멀티 서버가 시작되었습니다! 포트: ${PORT}`);
    console.log('종료하려면 Ctrl + C를 누르세요.');
});
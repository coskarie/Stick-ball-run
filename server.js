const express = require('express');
const http = require('http'); 
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app); 
const io = new Server(server);

const PORT = process.env.PORT || 3000; 

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 멀티플레이어 실시간 데이터 관리 ---
const players = {}; 
const roomHosts = {}; // 각 방의 '방장(Host)' 역할을 하는 유저 소켓 ID 저장

io.on('connection', (socket) => {
    console.log(`새로운 유저 접속: ${socket.id}`);

    socket.on('joinRoom', ({ name, room }) => {
        socket.join(room);
        
        // 룸에 처음 들어온 사람이면 방장으로 임명
        if (!roomHosts[room]) {
            roomHosts[room] = socket.id;
        }

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
            vx: 0,
            shieldAmmo: 50 // 방패 동기화를 위한 내구도 추가
        };

        const roomPlayers = Object.values(players).filter(p => p.room === room);
        
        // 본인에게 방 정보 및 본인의 방장 여부 전달
        socket.emit('initData', {
            isHost: roomHosts[room] === socket.id,
            players: roomPlayers
        });
        
        socket.to(room).emit('newPlayer', players[socket.id]);
        console.log(`[Room ${room}] ${name} 님이 입장하셨습니다. (방장: ${roomHosts[room] === socket.id})`);
    });

    socket.on('playerUpdate', (data) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], data);
            socket.to(players[socket.id].room).emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('shootBullet', (bulletData) => {
        if (players[socket.id]) {
            socket.to(players[socket.id].room).emit('remoteBullet', bulletData);
        }
    });

    // [추가] 방장이 스폰한 적을 방 전체에 동기화
    socket.on('spawnEnemy', (enemyData) => {
        if (players[socket.id]) {
            // 본인 포함 같은 방 모든 유저에게 전송하여 화면에 동시 생성
            io.to(players[socket.id].room).emit('enemySpawned', enemyData);
        }
    });

    // [추가] 적이 총에 맞았을 때 체력 동기화
    socket.on('enemyHit', ({ enemyId, damage }) => {
        if (players[socket.id]) {
            socket.to(players[socket.id].room).emit('updateEnemyHp', { enemyId, damage });
        }
    });

    socket.on('disconnect', () => {
        console.log(`유저 접속 종료: ${socket.id}`);
        if (players[socket.id]) {
            const room = players[socket.id].room;
            delete players[socket.id];
            socket.to(room).emit('playerDisconnected', socket.id);

            // 방장이 나갔을 경우 남은 인원 중 한 명에게 방장 권한 위임
            if (roomHosts[room] === socket.id) {
                const remaining = Object.values(players).filter(p => p.room === room);
                if (remaining.length > 0) {
                    roomHosts[room] = remaining[0].id;
                    io.to(remaining[0].id).emit('hostAssigned'); // 새 방장에게 알림
                    console.log(`[Room ${room}] 방장이 ${remaining[0].name} 님으로 변경되었습니다.`);
                } else {
                    delete roomHosts[room]; // 방이 비면 방장 데이터 삭제
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`스틱맨 멀티 서버가 시작되었습니다! http://localhost:${PORT}`);
    console.log('종료하려면 Ctrl + C를 누르세요.');
});

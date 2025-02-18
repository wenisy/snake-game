// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

const BOARD_SIZE = 2552;
const GRID_SIZE = 8;
const INITIAL_SNAKE_LENGTH = 5;
const COLORS = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080'];
// 在全局变量区域添加食物计数器
let eatenFoodCounter = 0;
const INITIAL_FOOD_COUNT = 1500; // 原来是50,现在增加到150
const INITIAL_NPC_COUNTS = 10;
const GENERATE_FOOD = 1; // 每吃掉3个食物, 屏幕恢复1个食物


let players = new Map(); // WebSocket -> Player data
let foods = new Set();



class NPCAI {
    constructor(username, level) {
        // 模拟一个没有真实 WebSocket 的玩家对象
        this.ws = null; // NPC 无需发送消息
        this.username = username;
        // 随机选一个颜色
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.snake = this.generateInitialSnake();
        this.direction = { x: 1, y: 0 };
        this.alive = true;
        this.speedFactor = 1; // 默认移动步数1
        this.level = level;   // 1～10 表示智力等级
    }

    generateInitialSnake() {
        const startX = Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE));
        const startY = Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE));
        const snake = [];
        for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
            snake.push({ x: startX - i, y: startY });
        }
        return snake;
    }


    updateDirection() {
        if (!this.alive) return;
        const head = this.snake[0];

        // 1. 寻找最近的食物
        let targetFood = null;
        let minDist = Infinity;
        foods.forEach(food => {
            const d = Math.abs(food.x - head.x) + Math.abs(food.y - head.y);  // 使用曼哈顿距离
            if (d < minDist) {
                minDist = d;
                targetFood = food;
            }
        });
        let desired = { x: 0, y: 0 };
        if (targetFood) {
            // 按曼哈顿距离比较，优先选择差距更大的轴
            const diffX = targetFood.x - head.x;
            const diffY = targetFood.y - head.y;
            if (Math.abs(diffX) >= Math.abs(diffY)) {
                desired.x = diffX > 0 ? 1 : (diffX < 0 ? -1 : 0);
                desired.y = 0;
            } else {
                desired.y = diffY > 0 ? 1 : (diffY < 0 ? -1 : 0);
                desired.x = 0;
            }
        } else {
            desired = { ...this.direction }; // 没有食物时保持原方向
        }

        // 2. 威胁检测：检测所有玩家（包括其他蛇）是否靠近
        const threatThreshold = 5;
        players.forEach(p => {
            if (!p.alive) return;
            const pHead = p.snake[0];
            const d = Math.abs(pHead.x - head.x) + Math.abs(pHead.y - head.y);
            if (d < threatThreshold && this.level >= 7) {
                // 计算远离威胁的方向（先计算差值，然后只选取主要轴）
                const diffX = head.x - pHead.x;
                const diffY = head.y - pHead.y;
                if (Math.abs(diffX) >= Math.abs(diffY)) {
                    desired.x = diffX > 0 ? 1 : (diffX < 0 ? -1 : 0);
                    desired.y = 0;
                } else {
                    desired.y = diffY > 0 ? 1 : (diffY < 0 ? -1 : 0);
                    desired.x = 0;
                }
            }
        });

        // 3. 如果计算结果不满足正交方向（意外同时有 x 和 y），只保留主要轴
        if (desired.x !== 0 && desired.y !== 0) {
            // 选择绝对值较大的那个方向
            if (Math.abs(desired.x) >= Math.abs(desired.y)) {
                desired.y = 0;
            } else {
                desired.x = 0;
            }
        }

        // 4. 避免180度反向（和当前移动方向直接相反）
        if (!(desired.x === -this.direction.x && desired.y === -this.direction.y)) {
            this.direction = desired;
        }
    }
}



// 添加全局变量
const MAX_HISTORY_SCORES = 20; // 保留前20名的分数,比显示的10名多一些,防止频繁清理

// 清理函数
function cleanupDeadPlayers() {
    // 获取所有玩家分数并排序
    let allScores = [...players.values(), ...npcs]
        .map(player => ({
            username: player.username,
            score: player.snake.length,
            isAlive: player.alive
        }))
        .sort((a, b) => b.score - a.score);

    // 获取需要保留的用户名集合(前20名)
    const keepUsernames = new Set(
        allScores.slice(0, MAX_HISTORY_SCORES).map(p => p.username)
    );

    // 清理已死亡且不在前20名的玩家
    players.forEach((player, ws) => {
        if (!player.alive && !keepUsernames.has(player.username)) {
            players.delete(ws);
        }
    });

    // 清理NPC
    npcs = npcs.filter(npc => 
        npc.alive || keepUsernames.has(npc.username)
    );
}


// 存放 NPC 的数组
let npcs = [];

// 生成一定数量的 NPC，等级随机（或按需设定）
// 例如生成3个 NPC
function spawnNPCs(count = 3) {
    for (let i = 0; i < count; i++) {
        // NPC 名字可以为 "NPC_1", "NPC_2"...
        const name = `NPC_${i + 1}`;
        // 随机设定等级 1～10
        const level = Math.floor(Math.random() * 10) + 1;
        npcs.push(new NPCAI(name, level));
        console.log(`Spawned NPC ${name} with level ${level}`);
    }
}
spawnNPCs(INITIAL_NPC_COUNTS);

// 在全局变量区域添加
const NPC_RESPAWN_DELAY = 3000; // 3秒后复活
let lastNPCCheck = Date.now();
let lastCleanupTime = Date.now();

// 修改checkAndRespawnNPCs函数
function checkAndRespawnNPCs() {
    const currentTime = Date.now();
    // 每隔一定时间才检查是否需要复活
    if (currentTime - lastNPCCheck < NPC_RESPAWN_DELAY) {
        return;
    }
    
    lastNPCCheck = currentTime;
    
    const aliveNPCs = npcs.filter(npc => npc.alive).length;
    if (aliveNPCs < INITIAL_NPC_COUNTS) {
        const respawnCount = INITIAL_NPC_COUNTS - aliveNPCs;
        
        // 获取前20名的用户名集合
        const topScores = [...players.values(), ...npcs]
            .sort((a, b) => b.snake.length - a.snake.length)
            .slice(0, MAX_HISTORY_SCORES)
            .map(p => p.username);

        // 保留活着的NPC和排行榜上的死亡NPC
        npcs = npcs.filter(npc => npc.alive || topScores.includes(npc.username));
        
        // 添加新的NPC
        for (let i = 0; i < respawnCount; i++) {
            const name = `NPC_${Math.floor(Math.random() * 1000)}`;
            const level = Math.floor(Math.random() * 10) + 1;
            npcs.push(new NPCAI(name, level));
        }
        
        console.log(`Respawned ${respawnCount} NPCs, total NPCs: ${npcs.length}`);
    }
}


class Player {
    constructor(ws, username) {
        this.ws = ws;
        this.username = username;
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.snake = this.generateInitialSnake();
        this.direction = { x: 1, y: 0 };
        this.alive = true;
        this.speedFactor = 1; // 新增：速度因子，默认为 1
    }

    generateInitialSnake() {
        const startX = Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE));
        const startY = Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE));
        const snake = [];
        for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
            snake.push({ x: startX - i, y: startY });
        }
        return snake;
    }
}

// 修改generateFood函数,确保食物在合理范围内生成
function generateFood(amount = 1) {
    for (let i = 0; i < amount; i++) {
        // 生成新食物时检查是否已经存在相同位置的食物
        let newFood;
        do {
            newFood = {
                x: Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE)),
                y: Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE)),
                id: Math.random().toString(36).substring(7)
            };
        } while (Array.from(foods).some(food => 
            food.x === newFood.x && food.y === newFood.y
        ));
        
        foods.add(newFood);
    }
}

// Initialize some food
generateFood(INITIAL_FOOD_COUNT);

// 在服务端的broadcastGameState函数中
function broadcastGameState() {
    // 获取前20名玩家的用户名集合
    const topScores = new Set(
        [...players.values(), ...npcs]
            .sort((a, b) => b.snake.length - a.snake.length)
            .slice(0, MAX_HISTORY_SCORES)
            .map(p => p.username)
    );

    // 发送活着的玩家和排行榜上的死亡玩家数据
    const relevantPlayers = [...players.values(), ...npcs]
        .filter(p => p.alive || topScores.has(p.username))
        .map(player => ({
            username: player.username,
            color: player.color,
            snake: player.snake,
            alive: player.alive,
            level: player.level || null
        }));

    const gameState = {
        type: 'gameState',
        players: relevantPlayers,
        foods: Array.from(foods)
    };

    const message = JSON.stringify(gameState);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}


function handleCollisions(snakeEntity) {
    // 边界环绕处理
    snakeEntity.snake[0].x = (snakeEntity.snake[0].x + BOARD_SIZE / GRID_SIZE) % (BOARD_SIZE / GRID_SIZE);
    snakeEntity.snake[0].y = (snakeEntity.snake[0].y + BOARD_SIZE / GRID_SIZE) % (BOARD_SIZE / GRID_SIZE);

    const head = snakeEntity.snake[0];
    const headLeft   = head.x * GRID_SIZE;
    const headTop    = head.y * GRID_SIZE;
    const headRight  = headLeft + GRID_SIZE * 5;
    const headBottom = headTop  + GRID_SIZE * 5;

    // 食物碰撞检测
    foods.forEach(food => {
        const foodCenterX = food.x * GRID_SIZE + GRID_SIZE / 2;
        const foodCenterY = food.y * GRID_SIZE + GRID_SIZE / 2;
        if (foodCenterX >= headLeft && foodCenterX <= headRight &&
            foodCenterY >= headTop && foodCenterY <= headBottom) {
            foods.delete(food);
            snakeEntity.snake.push({ ...snakeEntity.snake[snakeEntity.snake.length - 1] });
            eatenFoodCounter++;
            if (eatenFoodCounter >= 3) {
                eatenFoodCounter = 0;
                generateFood(GENERATE_FOOD);
            }
        }
    });

    // 检测与其他蛇的碰撞
    const allEntities = [
        ...Array.from(players.values()),
        ...npcs
    ];

    allEntities.forEach(other => {
        if (other === snakeEntity || !other.alive) return;

        // 头对头碰撞：双方死亡
        if (head.x === other.snake[0].x && head.y === other.snake[0].y) {
            snakeEntity.alive = false;
            other.alive = false;
            convertSnakeToFood(snakeEntity.snake);
            convertSnakeToFood(other.snake);
            return; // 已经死亡，不需要继续检测
        }

        // 蛇头碰撞到其它蛇身体
        for (let i = 1; i < other.snake.length; i++) {
            const segment = other.snake[i];
            if (head.x === segment.x && head.y === segment.y) {
                snakeEntity.alive = false;
                convertSnakeToFood(snakeEntity.snake);
                return; // 已经死亡，不需要继续检测
            }
        }
    });
}



function convertSnakeToFood(snake) {
    const foodCount = Math.floor(snake.length / 3);
    for (let i = 0; i < foodCount; i++) {
        const segment = snake[Math.floor(i * snake.length / foodCount)];
        foods.add({
            x: segment.x,
            y: segment.y,
            id: Math.random().toString(36).substring(7)
        });
    }
}

function updateGame() {
    // 处理真实玩家
    players.forEach(player => {
        if (!player.alive) return;
        const moves = player.speedFactor; // 正常为 1 或加速时为 2
        for (let i = 0; i < moves; i++) {
            const newHead = {
                x: player.snake[0].x + player.direction.x,
                y: player.snake[0].y + player.direction.y
            };
            player.snake.unshift(newHead);
            player.snake.pop();
            handleCollisions(player);
            if (!player.alive) break;
        }
    });

    // 处理 NPC 蛇的行为
    npcs.forEach(npc => {
        if (!npc.alive) return;
        // 先更新 NPC 的方向（AI决策）
        npc.updateDirection();
        const moves = npc.speedFactor;  // NPC 也可以支持加速效果，默认 1
        for (let i = 0; i < moves; i++) {
            const newHead = {
                x: npc.snake[0].x + npc.direction.x,
                y: npc.snake[0].y + npc.direction.y
            };
            npc.snake.unshift(newHead);
            npc.snake.pop();
            handleCollisions(npc);
            if (!npc.alive) break;
        }
    });
    checkAndRespawnNPCs();
    // 每隔一段时间清理一次(比如每5秒)
    if (Date.now() - lastCleanupTime > 5000) {
        cleanupDeadPlayers();
        lastCleanupTime = Date.now();
    }

    broadcastGameState();
}


// Game loop
setInterval(updateGame, 50); // 20 updates per second

wss.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    console.log(`Player joined: ${data.username}`);
                    // 删除该玩家之前的所有数据
                    players.forEach((player, playerWs) => {
                        if (player.username === data.username) {
                            players.delete(playerWs);
                        }
                    });
                    // 从NPC中也删除同名玩家（如果有的话）
                    npcs = npcs.filter(npc => npc.username !== data.username);
                    
                    // 创建新玩家
                    players.set(ws, new Player(ws, data.username));
                    break;

                case 'direction':
                    const player = players.get(ws);
                    if (player && player.alive) {
                        player.direction = data.direction;
                    }
                    break;
                    case 'boost':
                        const p = players.get(ws);
                        if (p && p.alive) {
                            // 如果 boost 为 true 则设置为 2，否则恢复为 1
                            p.speedFactor = data.boost ? 2 : 1;
                        }
                        break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        players.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
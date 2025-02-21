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
const INVINCIBLE_DURATION = 10000; // 无敌模式持续10秒

let players = new Map(); // WebSocket -> Player data
let foods = new Set();

// Add a variable to track the highest score and countdown state
let highestScore = 0;
let countdownStarted = false;
let countdownEndTime = null;

// At the global scope, replace or add a new variable for super food countdown end time
let superFoodCountdownEndTime = null;

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
        this.speedFactor = 1;
        this.isInvincible = false;
        this.invincibleEndTime = 0;
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

// 在全局变量区域添加
const MIN_SUPER_FOOD_INTERVAL = 15000; // 最小间隔15秒
const MAX_SUPER_FOOD_INTERVAL = 30000; // 最大间隔30秒
let nextSuperFoodTime = Date.now() + Math.random() * (MAX_SUPER_FOOD_INTERVAL - MIN_SUPER_FOOD_INTERVAL) + MIN_SUPER_FOOD_INTERVAL;
let superFoodPosition = null;
let nextSuperFoodPosition = null; // 新增：预定的超级食物位置

// 修改generateFood函数
function generateFood(amount = 1) {
    for (let i = 0; i < amount; i++) {
        let newFood;
        do {
            newFood = {
                x: Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE)),
                y: Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE)),
                id: Math.random().toString(36).substring(7),
                isSuper: false, // 超级食物不再随机生成
                emoji: null
            };
        } while (Array.from(foods).some(food => 
            food.x === newFood.x && food.y === newFood.y
        ));
        
        foods.add(newFood);
    }
}

// 修改generateSuperFood函数
function generateSuperFood() {
    // 使用预定位置生成超级食物
    const newSuperFood = {
        x: nextSuperFoodPosition.x,
        y: nextSuperFoodPosition.y,
        id: Math.random().toString(36).substring(7),
        isSuper: true,
        emoji: '🐻'
    };
    
    foods.add(newSuperFood);
    superFoodPosition = nextSuperFoodPosition;
    nextSuperFoodPosition = null;
    
    // 设置下一次生成时间
    nextSuperFoodTime = Date.now() + 
        Math.random() * (MAX_SUPER_FOOD_INTERVAL - MIN_SUPER_FOOD_INTERVAL) + 
        MIN_SUPER_FOOD_INTERVAL;
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
            level: player.level || null,
            isInvincible: player.isInvincible || false
        }));

    // Add countdown property if countdown is active
    const countdown = countdownStarted ? Math.ceil((countdownEndTime - Date.now()) / 1000) : null;

    // In the broadcastGameState function, compute superFoodCountdown dynamically
    const superFoodCountdown = superFoodCountdownEndTime ? Math.ceil((superFoodCountdownEndTime - Date.now()) / 1000) : null;

    const gameState = {
        type: 'gameState',
        players: relevantPlayers,
        foods: Array.from(foods),
        superFoodCountdown: superFoodCountdown,
        superFoodPosition,
        countdown: countdown
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

    // 检查无敌状态是否过期
    if (snakeEntity.isInvincible && Date.now() > snakeEntity.invincibleEndTime) {
        snakeEntity.isInvincible = false;
    }

    // 食物碰撞检测
    foods.forEach(food => {
        const foodCenterX = food.x * GRID_SIZE + GRID_SIZE / 2;
        const foodCenterY = food.y * GRID_SIZE + GRID_SIZE / 2;
        
        // 如果是无敌状态，增加食物检测范围
        const detectionRange = snakeEntity.isInvincible ? 2 : 1;
        const effectiveLeft = headLeft - (GRID_SIZE * 5 * (detectionRange - 1));
        const effectiveRight = headRight + (GRID_SIZE * 5 * (detectionRange - 1));
        const effectiveTop = headTop - (GRID_SIZE * 5 * (detectionRange - 1));
        const effectiveBottom = headBottom + (GRID_SIZE * 5 * (detectionRange - 1));

        if (foodCenterX >= effectiveLeft && foodCenterX <= effectiveRight &&
            foodCenterY >= effectiveTop && foodCenterY <= effectiveBottom) {
            foods.delete(food);
            snakeEntity.snake.push({ ...snakeEntity.snake[snakeEntity.snake.length - 1] });
            
            // 如果吃到超级食物，激活无敌模式
            if (food.isSuper) {
                snakeEntity.isInvincible = true;
                snakeEntity.invincibleEndTime = Date.now() + INVINCIBLE_DURATION;
            }
            
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

        // 如果双方都是无敌状态，则互不影响
        if (snakeEntity.isInvincible && other.isInvincible) {
            return;
        }

        // 如果当前蛇处于无敌状态，则碰到其他蛇时会导致其他蛇死亡
        if (snakeEntity.isInvincible) {
            // 检查是否与其他蛇的任何部分发生碰撞
            for (const segment of other.snake) {
                if (Math.abs(head.x - segment.x) <= 1 && Math.abs(head.y - segment.y) <= 1) {
                    other.alive = false;
                    convertSnakeToFood(other.snake);
                    return;
                }
            }
            return;
        }

        // 头对头碰撞：如果对方无敌，则当前蛇死亡；如果都不无敌，则双方死亡
        if (head.x === other.snake[0].x && head.y === other.snake[0].y) {
            if (other.isInvincible) {
                snakeEntity.alive = false;
                convertSnakeToFood(snakeEntity.snake);
            } else if (!snakeEntity.isInvincible) {
                snakeEntity.alive = false;
                other.alive = false;
                convertSnakeToFood(snakeEntity.snake);
                convertSnakeToFood(other.snake);
            }
            return;
        }

        // 蛇头碰撞到其它蛇身体
        for (let i = 1; i < other.snake.length; i++) {
            const segment = other.snake[i];
            if (head.x === segment.x && head.y === segment.y) {
                if (!snakeEntity.isInvincible) {
                    snakeEntity.alive = false;
                    convertSnakeToFood(snakeEntity.snake);
                }
                return;
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

// Modify the updateGame function to check for score exceeding 300
function updateGame() {
    const currentTime = Date.now();
    
    // Check if any player's score exceeds 300 and start countdown
    players.forEach(player => {
        if (player.snake.length > highestScore) {
            highestScore = player.snake.length;
        }
    });

    if (highestScore > 300 && !countdownStarted) {
        countdownStarted = true;
        countdownEndTime = currentTime + 20000; // 20 seconds countdown
    }

    // If countdown is active and time is up, end the game
    if (countdownStarted && currentTime >= countdownEndTime) {
        broadcastGameOver();
        countdownStarted = false; // Reset countdown state
    }

    // 处理超级食物的生成
    if (currentTime >= nextSuperFoodTime) {
        // 预先确定位置
        nextSuperFoodPosition = {
            x: Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE)),
            y: Math.floor(Math.random() * (BOARD_SIZE / GRID_SIZE))
        };
        superFoodPosition = nextSuperFoodPosition; // 立即更新位置以供指示器使用
        // Set the super food countdown end time to 5 seconds from now
        superFoodCountdownEndTime = currentTime + 5000; // 5秒倒计时
        // 5秒后生成超级食物
        setTimeout(() => {
            generateSuperFood();
            superFoodCountdownEndTime = null;
        }, 5000);
        nextSuperFoodTime = Infinity; // 防止重复触发
    }
    
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

// 添加重置游戏的函数
function resetGame() {
    // 重置所有游戏状态
    players = new Map();
    foods = new Set();
    npcs = [];
    highestScore = 0;
    eatenFoodCounter = 0;
    countdownStarted = false;
    countdownEndTime = null;
    superFoodCountdownEndTime = null;
    superFoodPosition = null;
    nextSuperFoodPosition = null;
    
    // 重新生成初始食物
    generateFood(INITIAL_FOOD_COUNT);
    
    // 重新生成NPC
    spawnNPCs(INITIAL_NPC_COUNTS);
    
    // 重置计时器
    lastNPCCheck = Date.now();
    lastCleanupTime = Date.now();
    
    // 设置下一次超级食物生成时间
    nextSuperFoodTime = Date.now() + 
        Math.random() * (MAX_SUPER_FOOD_INTERVAL - MIN_SUPER_FOOD_INTERVAL) + 
        MIN_SUPER_FOOD_INTERVAL;
    
    console.log('Game has been reset');
}

// 修改 broadcastGameOver 函数
function broadcastGameOver() {
    const gameOverMessage = JSON.stringify({
        type: 'gameOver',
        leaderboard: getLeaderboard()
    });
    
    // 广播游戏结束消息
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(gameOverMessage);
        }
    });
    
    // 设置延迟重置游戏
    setTimeout(() => {
        resetGame();
        // 广播游戏重置消息
        const resetMessage = JSON.stringify({
            type: 'gameReset'
        });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(resetMessage);
            }
        });
    }, 5000); // 5秒后重置游戏
}

// Function to get leaderboard data
function getLeaderboard() {
    return [...players.values(), ...npcs]
        .sort((a, b) => b.snake.length - a.snake.length)
        .map(player => ({
            username: player.username,
            score: player.snake.length
        }));
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

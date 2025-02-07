# Snake Battle Royale

**Snake Battle Royale** 是一款基于浏览器的多人贪食蛇竞技游戏。游戏支持真人玩家和 AI 控制的 NPC 同场竞技，利用 Node.js、Express 和 WebSocket 实现实时在线交互，并使用 HTML5 Canvas 渲染游戏画面。

## 特性

- **多人实时竞技**
    
    通过 WebSocket 实现实时通信，玩家可以在同一游戏房间内实时对战。
    
- **智能 NPC 对战**
    
    游戏中内置多名 NPC（电脑玩家），每个 NPC 都有随机的智能等级，它们会自动寻找食物并在威胁出现时作出逃避决策。
    
- **动态食物生成与成长机制**
    
    游戏中不断生成食物，蛇吃到食物后会变长。死亡的蛇会将部分身体转换为食物重新生成到地图中，保证游戏的持续性。
    
- **丰富的碰撞检测**
    
    实现了：
    
    - 蛇头与食物碰撞：触碰后蛇体增长。
    - 蛇头与蛇头碰撞：双方均死亡。
    - 蛇头碰撞其他蛇身体：触发碰撞蛇死亡。
- **加速功能**
    
    玩家按下方向键时支持短暂加速，让操作更加流畅和刺激。
    
- **边界环绕效果**
    
    游戏地图采用边界环绕模式，蛇体超出地图边界后会从另一侧重新出现。
    
- **实时记分板**
    
    屏幕右上角显示动态记分板，实时展示前十名玩家的得分和状态（存活/死亡）。
    

## 游戏截图
开始界面:
![Clipboard_Screenshot_1738898238](https://github.com/user-attachments/assets/86e901c8-2879-49be-ad47-e550087f25bd)

记分板:

![Clipboard_Screenshot_1738898269](https://github.com/user-attachments/assets/62eb8b10-2467-430a-b774-13bbb46242e9)

游戏页面:
![Clipboard_Screenshot_1738898299](https://github.com/user-attachments/assets/c4b8d11e-6979-4d8c-84a3-0adaaa48ba45)

结算页面:

![Clipboard_Screenshot_1738898647](https://github.com/user-attachments/assets/5e4765d3-9b3f-4a74-b2a3-ee5ab88f628c)


## 安装与运行

### 前置条件

- [Node.js](https://nodejs.org/)（建议使用 LTS 版本）
- npm（Node.js 默认包含）

### 克隆仓库

```
git clone https://github.com/your-username/snake-battle-royale.git
cd snake-battle-royale
```

### 安装依赖

在项目根目录下运行以下命令来安装所需依赖包：

```
npm install express ws
```

### 启动服务器

运行服务器：

```
node server.js
```

默认情况下，服务器会监听 `3000` 端口。启动后，在浏览器中访问：http://localhost:3000 即可进入游戏页面。

## 游戏玩法

1. **登录游戏**
    
    打开游戏页面后，在登录界面输入你的用户名，点击 “Join Battle” 加入游戏。
    
2. **控制你的蛇**
    
    使用键盘方向键（↑、↓、←、→）控制蛇的移动方向。按下方向键时会触发短暂的加速效果，增强游戏操作的趣味性。
    
3. **寻找食物**
    
    地图上会随机生成红色的食物，吃到食物后你的蛇会变长。注意：食物吃完一定数量后，系统会自动补充新的食物。
    
4. **避免碰撞**
    - 蛇头与蛇头相撞会导致双方死亡。
    - 蛇头碰到其他蛇的身体也会导致死亡。
    - 死亡的蛇会转换为地图上的食物，继续供其他玩家使用。
5. **观察记分板**
    
    游戏右上角有实时记分板，显示前 10 名玩家（以及部分历史得分较高的死亡玩家）的当前得分和状态。
    
6. **复活重试**
    
    当你的蛇死亡时，会显示“Game Over”界面，展示最终得分和排名，并可选择重试加入战斗。
    

## 代码结构

- **server.js**
    
    服务器端代码，基于 Express 和 WebSocket 实现：
    
    - 静态文件服务（客户端文件位于 `public` 目录）
    - 游戏逻辑（食物生成、碰撞检测、玩家与 NPC 管理、游戏状态广播）
    - NPC AI 行为（基于简单的策略自动寻找食物并逃避威胁）
- **public/**
    
    存放客户端相关文件：
    
    - `index.html`：游戏主页面，包含登录界面、Canvas 渲染和游戏逻辑控制。
    - 其他静态资源（如 CSS、JavaScript 文件等）。

## 开发与贡献

欢迎大家提交 Issue 或 Pull Request 为项目贡献代码和创意。如果你有任何问题或改进建议，请随时反馈。

### 开发环境

- Node.js (v14+ 或更高)
- 推荐使用 VS Code 或其他现代编辑器

### 代码规范

请尽量遵循项目现有的代码风格，添加必要的注释并确保代码格式统一。

## License

本项目采用 MIT 许可证。

## 致谢

感谢所有关注和支持 **Snake Battle Royale** 的开发者和玩家！希望大家能在这场贪食蛇竞技中玩得开心！

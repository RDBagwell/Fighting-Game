const canvas = document.querySelector('canvas');
const canvasContext = canvas.getContext('2d');
const gravity = 0.7;
const enemyBar = document.querySelector('.enemy-health-bar');
const playerBar = document.querySelector('.player-health-bar');
const gameTimer = document.querySelector('.timer');
const gameMessage = document.querySelector('.game-msg');
const background = new Sprite({ imageSRC: './assets/background.png', position: {x: 0, y: 0} });
const shop = new Sprite({ imageSRC: './assets/shop.png', position: {x: 600, y: 128}, scale: 2.75, frames: 6, currentFrame: 1 });

let timer = 99;
let timerID;

canvas.width = 1024;
canvas.height = 576;

canvasContext.fillRect(0, 0, canvas.width, canvas.height)
 
const player = new Fighter({
    position: { 
        x: 50,
        y: 0
    },
    velocity: {    
        x: 0,
        y: 10 
    },
    imageSRC: './assets/samuraiMack/Idle.png',
    scale: 2.75, 
    frames: 8, 
    currentFrame: 0,
    offset: {    
        x: 215,
        y: 188
    },
    sprites: {
        idle:{
            imageSRC: './assets/samuraiMack/Idle.png',
            frames: 8
        },
        run:{
            imageSRC: './assets/samuraiMack/Run.png',
            frames: 8
        },
        attack1:{
            imageSRC: './assets/samuraiMack/Attack1.png',
            frames: 6
        },
        attack2:{
            imageSRC: './assets/samuraiMack/Attack2.png',
            frames: 6
        },
        death:{
            imageSRC: './assets/samuraiMack/Death.png',
            frames: 6
        },
        fall:{
            imageSRC: './assets/samuraiMack/Fall.png',
            frames: 2
        },
        jump:{
            imageSRC: './assets/samuraiMack/Jump.png',
            frames: 2
        },
        take_hit:{
            imageSRC: './assets/samuraiMack/Take Hit.png',
            frames: 4
        }
    },
    attackBox: {
        offset:{
            x: 100,
            y: 50        
        },
        width: 200, 
        height: 50 
    }
});

const enemy = new Fighter({
    position: { 
        x: 924,
        y: 0
    },
    velocity: {    
        x: 0,
        y: 10 
    },
    imageSRC: './assets/kenji/Idle.png',
    scale: 2.75, 
    frames: 4, 
    currentFrame: 0,
    offset: {    
        x: 295,
        y: 203
    },
    sprites: {
        idle:{
            imageSRC: './assets/kenji/Idle.png',
            frames: 4
        },
        run:{
            imageSRC: './assets/kenji/Run.png',
            frames: 8
        },
        attack1:{
            imageSRC: './assets/kenji/Attack1.png',
            frames: 4
        },
        attack2:{
            imageSRC: './assets/kenji/Attack2.png',
            frames: 4
        },
        death:{
            imageSRC: './assets/kenji/Death.png',
            frames: 7
        },
        fall:{
            imageSRC: './assets/kenji/Fall.png',
            frames: 2
        },
        jump:{
            imageSRC: './assets/kenji/Jump.png',
            frames: 2
        },
        take_hit:{
            imageSRC: './assets/kenji/Take hit.png',
            frames: 3
        }
    },
    attackBox: {
        offset:{
            x: -250,
            y: 50        
        },
        width: 200, 
        height: 50 
    }
});

const keys = {
    a: {pressed: false},
    d: {pressed: false},
    left: {pressed: false},
    right: {pressed: false},
};


function countdownTimer() {
    timerID = setTimeout(countdownTimer, 1000);
    if(timer > -1) {
        gameTimer.innerHTML = timer;
        --timer;   
    } else {
        determineWinner();
    }
}


function animate(){

    window.requestAnimationFrame(animate);
    canvasContext.fillStyle = 'black'
    canvasContext.fillRect(0,0, canvas.width, canvas.height);
    background.update();
    shop.update();
    player.update();
    enemy.update();

    player.velocity.x = 0;
    enemy.velocity.x = 0;

    // Player Movmentddd
    
    if (keys.a.pressed && player.lastKey == 'a') {
        player.velocity.x = -5;
        player.switchSprite('run');
    } else if(keys.d.pressed && player.lastKey == 'd'){
        player.velocity.x = 5;
        player.switchSprite('run');
    } else {
        player.switchSprite('idle');
    }

    if(player.velocity.y < 0){
        player.switchSprite('jump');
    } else if (player.velocity.y > 0){
        player.switchSprite('fall');
    }

    // Enemy Movment
    if (keys.left.pressed && enemy.lastKey == 'left') {
        enemy.velocity.x = -5;
        enemy.switchSprite('run');
    } else if(keys.right.pressed && enemy.lastKey == 'right'){
        enemy.velocity.x = 5;
        enemy.switchSprite('run');
    } else {
        enemy.switchSprite('idle'); 
    }

    if(enemy.velocity.y < 0){
        enemy.switchSprite('jump');
    } else if (enemy.velocity.y > 0){
        enemy.switchSprite('fall');
    }

    // Collision

    // Player
    if(rectangularCollision({
        rectangle1: player, 
        rectangle2: enemy}
        ) && 
        player.isAttacking && 
        player.currentFrame === 4
        ){
            enemy.takeHit();
            player.isAttacking = false;
            enemyBar.style.width = `${enemy.health}%`;
        }
    if(player.isAttacking && player.currentFrame === 4){
        player.isAttacking = false;
    }

    // Enemy
    if(rectangularCollision({rectangle1: enemy, rectangle2: player}) && enemy.isAttacking){
        player.takeHit();
        enemy.isAttacking = false;
        playerBar.style.width = `${player.health}%`;
    }
    if(enemy.isAttacking && enemy.currentFrame === 2){
        enemy.isAttacking = false;
    }

    // win
    if(player.health <= 0 || enemy.health <= 0){
        determineWinner();
    }

}
addEventListener('keydown', (e)=>{
    if(!player.dead && !enemy.dead){
        switch (e.key) {
            // Player Keys
            case 'd':
                keys.d.pressed = true;
                player.lastKey = 'd';
                break;
            case 'a':
                keys.a.pressed = true;
                player.lastKey = 'a';
                break;
            case 'w':
                player.velocity.y = -20;
                break;
            case ' ':
                player.attack();
                break;
    
            // Enemy Keys
            case 'ArrowRight':
                keys.right.pressed = true;
                enemy.lastKey = 'right';
                break;
            case 'ArrowLeft':
                keys.left.pressed = true;
                enemy.lastKey = 'left';
                break;
            case 'ArrowUp':
                enemy.velocity.y = -20;     
                break;
            case 'ArrowDown':
                enemy.attack();
                break;                 
        } 
    }

}); 

addEventListener('keyup', (e)=>{
    switch (e.key) {
        case 'd':
            keys.d.pressed = false;
            break;
        case 'a':
            keys.a.pressed = false;   
            break;
        case 'ArrowRight':
            keys.right.pressed = false;
            break;
        case 'ArrowLeft':
            keys.left.pressed = false;
            break;          
        default:
            break;
    } 
}); 
 
animate();
countdownTimer();
const canvas = document.querySelector('canvas');
const canvasContext = canvas.getContext('2d');
const gravity = 0.7;
const enemyBar = document.querySelector('.enemy-health-bar');
const playerBar = document.querySelector('.player-health-bar');
const gameTimer = document.querySelector('.timer');
const gameMessage = document.querySelector('.game-msg');
const attackPercent = 10;

let timer = 99;
let timerID;

canvas.width = 1024;
canvas.height = 576;

canvasContext.fillRect(0,0, canvas.width, canvas.height)

class Sprite{

    constructor({position, width, height}){
        this.position = position;
        this.width = width;
        this.height = height;
    }

    draw(){

    }
        

    update(){
        this.draw();
    }
}

class Fighter{

    constructor({position,  velocity, color, width, height, offset}){
        this.position = position;
        this.velocity = velocity;
        this.color = color;
        this.width = width;
        this.height = height;
        this.lastKey;
        this.attackBox = {
            position: {
                x: this.position.x,
                y: this.position.y
            },
            offset,
            width: 100,
            height: 50
        }
        this.isAttacking;
        this.health = 100;
    }

    draw(){
        canvasContext.fillStyle = this.color;
        canvasContext.fillRect(this.position.x, this.position.y, this.width, this.height);
        
        // attack box
            if(this.isAttacking){
                canvasContext.fillStyle = 'green';
                canvasContext.fillRect(this.attackBox.position.x, this.attackBox.position.y, this.attackBox.width, this.attackBox.height);
            }
        }
        

    update(){
        this.draw();

        this.attackBox.position.x = this.position.x + this.attackBox.offset.x;
        this.attackBox.position.y = this.position.y;
        
        this.position.y += this.velocity.y;
        this.position.x += this.velocity.x;

        if(this.position.y + this.height + this.velocity.y >= canvas.height){
            this.velocity.y = 0;
        } else {
            this.velocity.y += gravity;
        }
    }

    attack(){
        this.isAttacking = true;

        setTimeout(()=>{
            this.isAttacking = false;
        }, 100)
    }
}
     
const player = new Fighter({
    position: { 
        x: 50,
        y: 0
    },
    velocity: {    
        x: 0,
        y: 10 
    },
    offset: {    
        x: 0,
        y: 0 
    },
    width: 50,
    height: 150,
    color: 'red'
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
    offset: {    
        x: -50,
        y: 0 
    },
    width: 50,
    height: 150,
    color: 'blue'
});

const keys = {
    a: {pressed: false},
    d: {pressed: false},
    left: {pressed: false},
    right: {pressed: false},
};

function rectangularCollision({rectangle1, rectangle2}) {
    return(
        rectangle1.attackBox.position.x + rectangle1.attackBox.width >= rectangle2.position.x &&
        rectangle1.attackBox.position.x <= rectangle2.position.x + rectangle2.width &&
        rectangle1.attackBox.position.y + rectangle1.attackBox.height >= rectangle2.position.y && 
        rectangle1.attackBox.position.y <= rectangle2.position.y + rectangle2.height
    );
}


function countdownTimer() {
    timerID = setTimeout(countdownTimer, 1000);
    
    if(timer > -1) {
        gameTimer.innerHTML = timer;
        --timer;   
    } else {
        determineWinner();
    }
}



function determineWinner() {
    clearTimeout(timerID);
    gameMessage.style.display = 'flex';
    if(player.health === enemy.health){
        gameMessage.innerHTML = 'Tie'
    }

    if(player.health > enemy.health){
        gameMessage.innerHTML = 'Player 1 Wins!'
    }

    if(player.health < enemy.health){
        gameMessage.innerHTML = 'Player 2 Wins!'
    }
}

function animate(){

    window.requestAnimationFrame(animate);
    canvasContext.fillStyle = 'black'
    canvasContext.fillRect(0,0, canvas.width, canvas.height);
    player.update();
    enemy.update();

    player.velocity.x = 0;
    enemy.velocity.x = 0;

    // Player Movment
    if (keys.a.pressed && player.lastKey == 'a') {
        player.velocity.x = -5;
    } else if(keys.d.pressed && player.lastKey == 'd'){
        player.velocity.x = 5;    
    }

    // Enemy Movment
    if (keys.left.pressed && enemy.lastKey == 'left') {
        enemy.velocity.x = -5;
    } else if(keys.right.pressed && enemy.lastKey == 'right'){
        enemy.velocity.x = 5;    
    }

    // Collision

    // Player
    if(rectangularCollision({rectangle1: player, rectangle2: enemy}) && player.isAttacking){
        player.isAttacking = false;
        enemy.health -= attackPercent;
        enemyBar.style.width = `${enemy.health}%`;
    }

    // Enemy
    if(rectangularCollision({rectangle1: enemy, rectangle2: player}) && enemy.isAttacking){
        enemy.isAttacking = false;
        player.health -= attackPercent
        playerBar.style.width = `${player.health}%`;
    }
    // win
    if(player.health <= 0 || enemy.health <= 0){
        determineWinner();
    }

}
addEventListener('keydown', (e)=>{
    switch (e.key) {
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
        default:
            break;
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
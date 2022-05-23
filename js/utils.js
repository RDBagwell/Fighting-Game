function rectangularCollision({rectangle1, rectangle2}) {
    return(
        rectangle1.attackBox.position.x + rectangle1.attackBox.width >= rectangle2.position.x &&
        rectangle1.attackBox.position.x <= rectangle2.position.x + rectangle2.width &&
        rectangle1.attackBox.position.y + rectangle1.attackBox.height >= rectangle2.position.y && 
        rectangle1.attackBox.position.y <= rectangle2.position.y + rectangle2.height
    );
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
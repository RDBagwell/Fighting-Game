class Sprite{

    constructor({position, imageSRC, scale = 1, frames = 1, offset = {x: 0, y: 0}}){
        this.position = position;
        this.image = new Image()
        this.image.src = imageSRC;
        this.scale = scale
        this.frames = frames,
        this.framesElapesed = 0,
        this.framesHold = 10,
        this.currentFrame = 0,
        this.offset = offset
    }

    draw(){
        canvasContext.drawImage(
            this.image,
            this.currentFrame * (this.image.width / this.frames),
            0,
            this.image.width  / this.frames,
            this.image.height,            
            this.position.x - this.offset.x, 
            this.position.y - this.offset.y, 
            (this.image.width / this.frames) * this.scale, 
            this.image.height * this.scale 
        )
    }

    animateFrames(){
        this.framesElapesed++

        if(this.framesElapesed % this.framesHold === 0){
            if(this.currentFrame < this.frames - 1){
                this.currentFrame++;
            } else {
                this.currentFrame = 0;
            }
        }

    }

    update(){
        this.draw();
        this.animateFrames();
    }
}

class Fighter extends Sprite {

    constructor({
        position,  
        velocity, 
        imageSRC, 
        scale = 1, 
        frames = 1,
        offset = { x: 0, y: 0 },
        sprites
    }){
        super(
            {
                position,
                imageSRC, 
                scale,
                frames,
                offset
            });

        this.velocity = velocity;
        this.width = 50;
        this.height = 150;
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
        this.framesElapesed = 0,
        this.framesHold = 10,
        this.currentFrame = 0
        this.isAttacking,
        this.health = 100,
        this.sprites = sprites

        for(const sprite in this.sprites){
            sprites[sprite].image = new Image();
            sprites[sprite].image.src = sprites[sprite].imageSRC;
        }
        console.log(sprites)
    }

    update(){
        this.draw();
        this.animateFrames();

        this.attackBox.position.x = this.position.x + this.attackBox.offset.x;
        this.attackBox.position.y = this.position.y;
        
        this.position.y += this.velocity.y;
        this.position.x += this.velocity.x;

        if(this.position.y + this.height + this.velocity.y >= canvas.height - 96){
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

    // switchSprite(sprite){
    //     switch (sprite) {
    //         case 'idle':
    //             if(!this.image === this.sprites.idle.image)
    //                 this.image = this.sprites.idle.image;
    //                 this.frames = this.sprites.idle.frames;
    //                 this.currentFrame = 0;
    //             break;
    //         case 'run':
    //             if(!this.image === this.sprites.run.image)
    //                 this.image = this.sprites.run.image;
    //                 this.frames = this.sprites.run.frames;
    //             break;
    //         case 'jump':
    //             if(!this.image === this.sprites.jump.image)
    //                 this.image = this.sprites.jump.image;
    //                 this.frames = this.sprites.jump.frames;
    //             break;    

    //         default:
    //             break;
    //     }
    // }
}
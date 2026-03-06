import * as THREE from 'three';

class GameState {
    constructor() {
        this.maxHealth = 5;
        this.health = 5;
        this.score = 0;
        this.listeners = new Set();
        this.isInvincible = false;
        this._invincibilityTimeout = null;

        this.shipPosition = new THREE.Vector3(0, -4, 5);
        this.missilePositions = new Map();

        // Combo / Near-miss
        this.combo = 1;
        this.comboTimer = 0;
        this.comboTimeout = 3.0;
        this.nearMissCount = 0;

        // HUD flash events
        this.hudFlash = null;

        // Wave system
        this.wave = 1;
        this.waveTimer = 0;
        this.waveDuration = 30;

        // Bullet system — pool managed by PlayerBullets component
        this.bulletQueue = []; // queued spawn requests { x, y, z }
        this.bulletPositions = new Map(); // id -> Vector3 (for collision)

        // Enemy ships
        this.enemyPositions = new Map(); // id -> { pos: Vector3, health: number }
        this.kills = 0;

        // Missile spawn queue — enemies push spawn requests here, Missiles component consumes
        this.missileSpawnQueue = []; // { x, y, z }

        // Enemy laser spawn queue — enemies fire laser bolts, EnemyLasers component consumes
        this.enemyLaserQueue = []; // { x, y, z, tx, ty, tz } — position + target
        this.enemyLaserPositions = new Map(); // id -> Vector3 (for collision with player)

        // Weapon power-up system (Chicken Invader style)
        this.weaponLevel = 1; // 1-5
        this.powerUpQueue = []; // queued power-up spawn positions
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notify() {
        this.listeners.forEach(cb => cb(this.getState()));
    }

    getState() {
        return {
            health: this.health,
            maxHealth: this.maxHealth,
            score: this.score,
            isInvincible: this.isInvincible,
            combo: this.combo,
            nearMissCount: this.nearMissCount,
            wave: this.wave,
            hudFlash: this.hudFlash,
            kills: this.kills,
            weaponLevel: this.weaponLevel,
        };
    }

    updateFrame(delta, edmState) {
        if (this.health <= 0) return;

        const stateMultiplier = edmState === 'drop' ? 3 : edmState === 'buildup' ? 1.5 : 1;
        this.score += 10 * delta * stateMultiplier * this.combo;

        if (this.combo > 1) {
            this.comboTimer += delta;
            if (this.comboTimer >= this.comboTimeout) {
                this.combo = 1;
                this.comboTimer = 0;
                this.notify();
            }
        }

        this.waveTimer += delta;
        if (this.waveTimer >= this.waveDuration) {
            this.waveTimer = 0;
            this.wave += 1;
            this.hudFlash = { type: 'wave', value: this.wave, time: Date.now() };
            this.notify();
        }
    }

    checkNearMiss(missilePos) {
        if (this.health <= 0) return;
        const dist = this.shipPosition.distanceTo(missilePos);
        if (dist > 1.2 && dist < 8) {
            this.nearMissCount += 1;
            this.comboTimer = 0;
            this.combo = Math.min(this.combo + 1, 4);
            this.score += 100 * this.combo;
            this.hudFlash = { type: 'near-miss', value: this.combo, time: Date.now() };
            this.notify();
        }
    }

    takeDamage() {
        if (this.isInvincible || this.health <= 0) return;
        this.health -= 1;
        this.combo = 1;
        this.comboTimer = 0;
        this.isInvincible = true;
        this.notify();

        window.dispatchEvent(new CustomEvent('ship-explosion'));

        if (this._invincibilityTimeout) clearTimeout(this._invincibilityTimeout);
        this._invincibilityTimeout = setTimeout(() => {
            this.isInvincible = false;
            this._invincibilityTimeout = null;
            this.notify();
        }, 1500);
    }

    repair() {
        if (this.health >= this.maxHealth) return false;
        this.health = Math.min(this.health + 1, this.maxHealth);
        this.hudFlash = { type: 'repair', time: Date.now() };
        this.notify();
        return true;
    }

    // Shooting — fires multiple bullets based on weapon level
    fireBullet(x, y, z) {
        const lvl = this.weaponLevel;
        // Level 1: single center
        // Level 2: two parallel
        // Level 3: center + two angled
        // Level 4: two parallel + two wide-angled
        // Level 5: center + two angled + two wide-angled
        const spread = 0.6;
        const angleSmall = 0.06;
        const angleLarge = 0.12;

        if (lvl === 1) {
            this.bulletQueue.push({ x, y, z, dx: 0 });
        } else if (lvl === 2) {
            this.bulletQueue.push({ x: x - spread * 0.5, y, z, dx: 0 });
            this.bulletQueue.push({ x: x + spread * 0.5, y, z, dx: 0 });
        } else if (lvl === 3) {
            this.bulletQueue.push({ x, y, z, dx: 0 });
            this.bulletQueue.push({ x: x - spread * 0.3, y, z, dx: -angleSmall });
            this.bulletQueue.push({ x: x + spread * 0.3, y, z, dx: angleSmall });
        } else if (lvl === 4) {
            this.bulletQueue.push({ x: x - spread * 0.4, y, z, dx: 0 });
            this.bulletQueue.push({ x: x + spread * 0.4, y, z, dx: 0 });
            this.bulletQueue.push({ x: x - spread * 0.8, y, z, dx: -angleLarge });
            this.bulletQueue.push({ x: x + spread * 0.8, y, z, dx: angleLarge });
        } else {
            this.bulletQueue.push({ x, y, z, dx: 0 });
            this.bulletQueue.push({ x: x - spread * 0.4, y, z, dx: -angleSmall });
            this.bulletQueue.push({ x: x + spread * 0.4, y, z, dx: angleSmall });
            this.bulletQueue.push({ x: x - spread * 0.8, y, z, dx: -angleLarge });
            this.bulletQueue.push({ x: x + spread * 0.8, y, z, dx: angleLarge });
        }
    }

    weaponPowerUp() {
        if (this.weaponLevel >= 5) return;
        this.weaponLevel = Math.min(this.weaponLevel + 1, 5);
        this.hudFlash = { type: 'powerup', value: this.weaponLevel, time: Date.now() };
        this.notify();
    }

    updateBulletPosition(id, position) {
        this.bulletPositions.set(id, position);
    }

    removeBullet(id) {
        this.bulletPositions.delete(id);
    }

    // Enemy tracking
    updateEnemyPosition(id, pos, health, shieldHealth) {
        this.enemyPositions.set(id, { pos, health, shieldHealth: shieldHealth || 0 });
    }

    removeEnemy(id) {
        this.enemyPositions.delete(id);
    }

    enemyDestroyed(enemyPos) {
        this.kills += 1;
        this.score += 500 * this.combo;
        this.hudFlash = { type: 'kill', time: Date.now() };
        // Drop a power-up at the enemy's position (50% chance)
        if (enemyPos && Math.random() < 0.5) {
            this.powerUpQueue.push({ x: enemyPos.x, y: enemyPos.y, z: enemyPos.z });
        }
        this.notify();
    }

    reset() {
        this.health = this.maxHealth;
        this.score = 0;
        this.combo = 1;
        this.comboTimer = 0;
        this.nearMissCount = 0;
        this.wave = 1;
        this.waveTimer = 0;
        this.hudFlash = null;
        this.kills = 0;
        this.weaponLevel = 1;
        this.bulletQueue = [];
        this.bulletPositions.clear();
        this.enemyPositions.clear();
        this.missileSpawnQueue = [];
        this.powerUpQueue = [];

        if (this._invincibilityTimeout) {
            clearTimeout(this._invincibilityTimeout);
            this._invincibilityTimeout = null;
        }
        this.isInvincible = false;
        this.missilePositions.clear();
        this.enemyLaserQueue = [];
        this.enemyLaserPositions.clear();
        this.notify();
    }

    updateEnemyLaserPosition(id, position) {
        this.enemyLaserPositions.set(id, position);
    }

    removeEnemyLaser(id) {
        this.enemyLaserPositions.delete(id);
    }

    updateMissilePosition(index, position) {
        this.missilePositions.set(index, position);
    }

    updateShipPosition(position) {
        this.shipPosition.copy(position);
    }

    getWaveMissileCount() {
        return Math.floor(5 + (this.wave - 1) * 3);
    }

    getWaveSpeedMultiplier() {
        return 1 + (this.wave - 1) * 0.15;
    }

    getWaveHomingMultiplier() {
        return 1 + (this.wave - 1) * 0.2;
    }
}

export const gameState = new GameState();

import * as THREE from 'three';

const DIFFICULTY_PRESETS = {
    easy:    { health: 7, enemyHealthMult: 0.7, fireRateMult: 0.6, missileCountMult: 0.5, missileSpeedMult: 0.8, homingMult: 0.6 },
    normal:  { health: 5, enemyHealthMult: 1.0, fireRateMult: 1.0, missileCountMult: 1.0, missileSpeedMult: 1.0, homingMult: 1.0 },
    hard:    { health: 4, enemyHealthMult: 1.3, fireRateMult: 1.5, missileCountMult: 1.5, missileSpeedMult: 1.3, homingMult: 1.5 },
    extreme: { health: 3, enemyHealthMult: 1.8, fireRateMult: 2.0, missileCountMult: 2.0, missileSpeedMult: 1.6, homingMult: 2.0 },
};

class GameState {
    constructor() {
        // Difficulty
        this.difficulty = localStorage.getItem('soundVoyage_difficulty') || 'normal';
        this.difficultyPreset = DIFFICULTY_PRESETS[this.difficulty];

        this.maxHealth = this.difficultyPreset.health;
        this.health = this.maxHealth;
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

        // Space mines — enemies drop these, they drift toward player
        this.mineSpawnQueue = []; // { x, y, z }
        this.minePositions = new Map(); // id -> Vector3

        // Weapon power-up system (Chicken Invader style)
        this.weaponLevel = 1; // 1-5
        this.powerUpQueue = []; // queued power-up spawn positions

        // High score persistence
        this.highScore = parseInt(localStorage.getItem('soundVoyage_highScore') || '0', 10);

        // Pause flag — checked by all useFrame callbacks to freeze gameplay
        this.paused = false;
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
            highScore: this.highScore,
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

    _saveHighScore() {
        const finalScore = Math.floor(this.score);
        if (finalScore > this.highScore) {
            this.highScore = finalScore;
            try { localStorage.setItem('soundVoyage_highScore', String(finalScore)); } catch (e) { /* quota exceeded */ }
        }
    }

    takeDamage() {
        if (this.isInvincible || this.health <= 0) return;
        this.health -= 1;
        if (this.health <= 0) this._saveHighScore();
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
        // Prevent queue overflow — drop oldest if too large
        if (this.bulletQueue.length > 60) this.bulletQueue.length = 60;
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
        if (enemyPos && Math.random() < 0.5 && this.powerUpQueue.length < 10) {
            this.powerUpQueue.push({ x: enemyPos.x, y: enemyPos.y, z: enemyPos.z });
        }
        this.notify();
    }

    reset() {
        this.maxHealth = this.difficultyPreset.health;
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
        this.mineSpawnQueue = [];
        this.minePositions.clear();
        this.powerUpQueue = [];

        if (this._invincibilityTimeout) {
            clearTimeout(this._invincibilityTimeout);
            this._invincibilityTimeout = null;
        }
        this.isInvincible = false;
        this.paused = false;
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

    setDifficulty(level) {
        if (!DIFFICULTY_PRESETS[level]) return;
        this.difficulty = level;
        this.difficultyPreset = DIFFICULTY_PRESETS[level];
        try { localStorage.setItem('soundVoyage_difficulty', level); } catch (e) { /* quota */ }
    }

    getWaveMissileCount() {
        return Math.floor((5 + (this.wave - 1) * 3) * this.difficultyPreset.missileCountMult);
    }

    getWaveSpeedMultiplier() {
        return (1 + (this.wave - 1) * 0.15) * this.difficultyPreset.missileSpeedMult;
    }

    getWaveHomingMultiplier() {
        return (1 + (this.wave - 1) * 0.2) * this.difficultyPreset.homingMult;
    }

    getFireRateMultiplier() {
        return this.difficultyPreset.fireRateMult;
    }

    getEnemyHealthMultiplier() {
        return this.difficultyPreset.enemyHealthMult;
    }

    updateMinePosition(id, position) {
        this.minePositions.set(id, position);
    }

    removeMine(id) {
        this.minePositions.delete(id);
    }
}

export const gameState = new GameState();

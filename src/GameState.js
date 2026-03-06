import * as THREE from 'three';

// Simple reactive state manager for game mechanics
class GameState {
    constructor() {
        this.maxHealth = 5;
        this.health = 5;
        this.score = 0;
        this.listeners = new Set();
        this.isInvincible = false;

        // Track spaceship position for missile homing
        this.shipPosition = new THREE.Vector3(0, -4, 5);

        // Track missile positions centrally for collision detection
        this.missilePositions = new Map();
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notify() {
        this.listeners.forEach(cb => cb({
            health: this.health,
            maxHealth: this.maxHealth,
            score: this.score,
            isInvincible: this.isInvincible
        }));
    }

    takeDamage() {
        if (this.isInvincible || this.health <= 0) return;

        this.health -= 1;
        this.isInvincible = true;
        this.notify();

        // Trigger explosion event
        window.dispatchEvent(new CustomEvent('ship-explosion'));

        // Brief invincibility period
        setTimeout(() => {
            this.isInvincible = false;
            this.notify();
        }, 1500);
    }

    reset() {
        this.health = this.maxHealth;
        this.score = 0;
        this.isInvincible = false;
        this.notify();
    }

    updateMissilePosition(index, position) {
        this.missilePositions.set(index, position);
    }

    updateShipPosition(position) {
        this.shipPosition.copy(position);
    }
}

export const gameState = new GameState();

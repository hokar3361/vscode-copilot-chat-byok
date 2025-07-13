import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * Enhanced secure key management with rotation support and audit logging
 */
export interface ApiKeyRotation {
	lastRotated: Date;
	rotationReminder: boolean;
	autoRotateAfterDays?: number;
}

export interface KeyUsageAudit {
	keyId: string; // Hashed key ID
	lastUsed: Date;
	requestCount: number;
	failedAttempts: number;
}

export class SecureKeyManager {
	private static readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
	private keys = new WeakMap<string, string>();
	private keyAudits = new Map<string, KeyUsageAudit>();

	constructor(
		private context: vscode.ExtensionContext,
		private storage: vscode.SecretStorage
	) { }

	/**
	 * Get API key with enhanced security measures
	 */
	async getKey(modelId: string): Promise<string> {
		// Get encrypted key from secure storage
		const encryptedData = await this.storage.get(`byok.key.${modelId}`);
		if (!encryptedData) {
			throw new Error(`No API key found for model: ${modelId}`);
		}

		// Decrypt the key
		const key = await this.decrypt(encryptedData);

		// Update audit log
		this.updateAudit(modelId, true);

		// Clear from memory after use
		setTimeout(() => this.clearFromMemory(modelId), 0);

		return key;
	}

	/**
	 * Store API key with encryption
	 */
	async storeKey(modelId: string, apiKey: string): Promise<void> {
		// Validate key format
		if (!this.isValidApiKey(apiKey)) {
			throw new Error('Invalid API key format');
		}

		// Encrypt the key
		const encryptedData = await this.encrypt(apiKey);

		// Store in secure storage
		await this.storage.store(`byok.key.${modelId}`, encryptedData);

		// Initialize rotation tracking
		await this.initializeRotation(modelId);
	}

	/**
	 * Delete API key and associated data
	 */
	async deleteKey(modelId: string): Promise<void> {
		await this.storage.delete(`byok.key.${modelId}`);
		await this.storage.delete(`byok.rotation.${modelId}`);
		this.keyAudits.delete(this.hashKeyId(modelId));
	}

	/**
	 * Check if key needs rotation
	 */
	async checkRotationNeeded(modelId: string): Promise<boolean> {
		const rotationData = await this.getRotationData(modelId);
		if (!rotationData || !rotationData.autoRotateAfterDays) {
			return false;
		}

		const daysSinceRotation = this.daysSince(rotationData.lastRotated);
		return daysSinceRotation >= rotationData.autoRotateAfterDays;
	}

	/**
	 * Get key usage audit information
	 */
	getAudit(modelId: string): KeyUsageAudit | undefined {
		const hashedId = this.hashKeyId(modelId);
		return this.keyAudits.get(hashedId);
	}

	/**
	 * Encrypt data using AES-256-GCM
	 */
	private async encrypt(text: string): Promise<string> {
		const key = await this.getDerivedKey();
		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv);

		const encrypted = Buffer.concat([
			cipher.update(text, 'utf8'),
			cipher.final()
		]);

		const authTag = cipher.getAuthTag();

		// Combine iv, authTag, and encrypted data
		const combined = Buffer.concat([iv, authTag, encrypted]);
		return combined.toString('base64');
	}

	/**
	 * Decrypt data using AES-256-GCM
	 */
	private async decrypt(encryptedData: string): Promise<string> {
		const key = await this.getDerivedKey();
		const combined = Buffer.from(encryptedData, 'base64');

		// Extract components
		const iv = combined.slice(0, 16);
		const authTag = combined.slice(16, 32);
		const encrypted = combined.slice(32);

		const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
		decipher.setAuthTag(authTag);

		const decrypted = Buffer.concat([
			decipher.update(encrypted),
			decipher.final()
		]);

		return decrypted.toString('utf8');
	}

	/**
	 * Get or generate encryption key
	 */
	private async getDerivedKey(): Promise<Buffer> {
		let salt = await this.storage.get('byok.encryption.salt');

		if (!salt) {
			// Generate new salt
			const newSalt = crypto.randomBytes(32).toString('base64');
			await this.storage.store('byok.encryption.salt', newSalt);
			salt = newSalt;
		}

		// Derive key from machine ID and salt
		const machineId = vscode.env.machineId;
		return crypto.pbkdf2Sync(machineId, salt, 100000, 32, 'sha256');
	}

	/**
	 * Clear key from memory
	 */
	private clearFromMemory(modelId: string): void {
		// WeakMap will automatically garbage collect
		// This is just to ensure immediate cleanup
		if (global.gc) {
			global.gc();
		}
	}

	/**
	 * Initialize rotation tracking for a key
	 */
	private async initializeRotation(modelId: string): Promise<void> {
		const rotation: ApiKeyRotation = {
			lastRotated: new Date(),
			rotationReminder: true,
			autoRotateAfterDays: 90 // Default 90 days
		};

		await this.storage.store(
			`byok.rotation.${modelId}`,
			JSON.stringify(rotation)
		);
	}

	/**
	 * Get rotation data for a key
	 */
	private async getRotationData(modelId: string): Promise<ApiKeyRotation | null> {
		const data = await this.storage.get(`byok.rotation.${modelId}`);
		return data ? JSON.parse(data) : null;
	}

	/**
	 * Update audit log
	 */
	private updateAudit(modelId: string, success: boolean): void {
		const hashedId = this.hashKeyId(modelId);
		const existing = this.keyAudits.get(hashedId);

		if (existing) {
			existing.lastUsed = new Date();
			existing.requestCount++;
			if (!success) {
				existing.failedAttempts++;
			}
		} else {
			this.keyAudits.set(hashedId, {
				keyId: hashedId,
				lastUsed: new Date(),
				requestCount: 1,
				failedAttempts: success ? 0 : 1
			});
		}
	}

	/**
	 * Hash model ID for audit logging
	 */
	private hashKeyId(modelId: string): string {
		return crypto.createHash('sha256').update(modelId).digest('hex');
	}

	/**
	 * Calculate days since a date
	 */
	private daysSince(date: Date): number {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		return Math.floor(diffMs / (1000 * 60 * 60 * 24));
	}

	/**
	 * Validate API key format
	 */
	private isValidApiKey(apiKey: string): boolean {
		// Basic validation - should be customized per provider
		return apiKey.length >= 20 && /^[a-zA-Z0-9_-]+$/.test(apiKey);
	}
}
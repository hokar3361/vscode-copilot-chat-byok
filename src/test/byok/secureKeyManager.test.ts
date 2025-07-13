/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { SecureKeyManager } from '../../byok/improvements/secureKeyManager';

suite('SecureKeyManager Tests', () => {
	let mockContext: vscode.ExtensionContext;
	let mockSecretStorage: vscode.SecretStorage;
	let secureKeyManager: SecureKeyManager;

	setup(() => {
		// Mock secret storage
		const secretStore = new Map<string, string>();
		mockSecretStorage = {
			get: async (key: string) => secretStore.get(key),
			store: async (key: string, value: string) => { secretStore.set(key, value); },
			delete: async (key: string) => { secretStore.delete(key); },
			onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
		};

		// Mock extension context
		mockContext = {
			secrets: mockSecretStorage,
			globalState: {
				get: () => undefined,
				update: async () => { },
				keys: () => []
			}
		} as any;

		secureKeyManager = new SecureKeyManager(mockContext, mockSecretStorage);
	});

	test('should store and retrieve API key securely', async () => {
		const modelId = 'test-model';
		const apiKey = 'test-api-key-12345';

		await secureKeyManager.storeKey(modelId, apiKey);
		const retrievedKey = await secureKeyManager.getKey(modelId);

		assert.strictEqual(retrievedKey, apiKey);
	});

	test('should validate API key format', async () => {
		const modelId = 'test-model';
		const invalidKey = 'short';

		try {
			await secureKeyManager.storeKey(modelId, invalidKey);
			assert.fail('Should have thrown validation error');
		} catch (error) {
			assert.strictEqual(error.message, 'Invalid API key format');
		}
	});

	test('should handle missing keys gracefully', async () => {
		try {
			await secureKeyManager.getKey('nonexistent-model');
			assert.fail('Should have thrown error for missing key');
		} catch (error) {
			assert.strictEqual(error.message, 'No API key found for model: nonexistent-model');
		}
	});

	test('should track key rotation status', async () => {
		const modelId = 'test-model';
		const apiKey = 'test-api-key-12345';

		await secureKeyManager.storeKey(modelId, apiKey);

		// Should not need rotation immediately
		const needsRotation = await secureKeyManager.checkRotationNeeded(modelId);
		assert.strictEqual(needsRotation, false);
	});

	test('should maintain audit trail', async () => {
		const modelId = 'test-model';
		const apiKey = 'test-api-key-12345';

		await secureKeyManager.storeKey(modelId, apiKey);
		await secureKeyManager.getKey(modelId);

		const audit = secureKeyManager.getAudit(modelId);
		assert.ok(audit);
		assert.strictEqual(audit.requestCount, 1);
		assert.strictEqual(audit.failedAttempts, 0);
	});

	test('should clean up when deleting keys', async () => {
		const modelId = 'test-model';
		const apiKey = 'test-api-key-12345';

		await secureKeyManager.storeKey(modelId, apiKey);
		await secureKeyManager.deleteKey(modelId);

		try {
			await secureKeyManager.getKey(modelId);
			assert.fail('Should have thrown error after deletion');
		} catch (error) {
			assert.strictEqual(error.message, 'No API key found for model: test-model');
		}
	});
});

suite('Error Handling Tests', () => {
	test('should create appropriate error types', async () => {
		const { AuthenticationError, RateLimitError, NetworkError } = await import('../../byok/improvements/errorHandling');

		const authError = new AuthenticationError('TestProvider');
		assert.strictEqual(authError.code, 'AUTH_FAILED');
		assert.strictEqual(authError.isRetryable, false);

		const rateError = new RateLimitError('TestProvider', 60);
		assert.strictEqual(rateError.code, 'RATE_LIMIT');
		assert.strictEqual(rateError.isRetryable, true);

		const networkError = new NetworkError('TestProvider');
		assert.strictEqual(networkError.code, 'NETWORK_ERROR');
		assert.strictEqual(networkError.isRetryable, true);
	});

	test('should map Anthropic errors correctly', async () => {
		const { ErrorMapper } = await import('../../byok/improvements/errorHandling');

		const authError = ErrorMapper.mapAnthropicError({ status: 401 });
		assert.strictEqual(authError.code, 'AUTH_FAILED');

		const rateError = ErrorMapper.mapAnthropicError({ status: 429 });
		assert.strictEqual(rateError.code, 'RATE_LIMIT');

		const notFoundError = ErrorMapper.mapAnthropicError({ status: 404, model: 'test-model' });
		assert.strictEqual(notFoundError.code, 'MODEL_NOT_FOUND');
	});

	test('should implement retry strategy with backoff', async () => {
		const { RetryStrategy } = await import('../../byok/improvements/errorHandling');

		const retryStrategy = new RetryStrategy();
		let attempts = 0;

		try {
			await retryStrategy.executeWithRetry(async () => {
				attempts++;
				if (attempts < 3) {
					throw new Error('Temporary failure');
				}
				return 'success';
			}, {
				maxRetries: 3,
				initialDelayMs: 10,
				shouldRetry: () => true
			});
		} catch (error) {
			// Should succeed on third attempt
			assert.fail('Should have succeeded after retries');
		}

		assert.strictEqual(attempts, 3);
	});
});
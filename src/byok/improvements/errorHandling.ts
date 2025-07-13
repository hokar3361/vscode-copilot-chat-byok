/**
 * Enhanced error handling system for BYOK
 */

export abstract class BYOKError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly isRetryable: boolean,
		public readonly userAction?: string,
		public readonly details?: Record<string, any>
	) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}

	toJSON() {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			isRetryable: this.isRetryable,
			userAction: this.userAction,
			details: this.details
		};
	}
}

export class AuthenticationError extends BYOKError {
	constructor(provider: string, details?: Record<string, any>) {
		super(
			`Authentication failed for ${provider}`,
			'AUTH_FAILED',
			false,
			'Please check your API key and try again',
			details
		);
	}
}

export class RateLimitError extends BYOKError {
	constructor(provider: string, retryAfter?: number, details?: Record<string, any>) {
		super(
			`Rate limit exceeded for ${provider}`,
			'RATE_LIMIT',
			true,
			retryAfter ? `Please wait ${retryAfter} seconds` : 'Please try again later',
			{ ...details, retryAfter }
		);
	}
}

export class NetworkError extends BYOKError {
	constructor(provider: string, originalError?: Error) {
		super(
			`Network error connecting to ${provider}`,
			'NETWORK_ERROR',
			true,
			'Please check your internet connection',
			{ originalError: originalError?.message }
		);
	}
}

export class ModelNotFoundError extends BYOKError {
	constructor(modelId: string, provider: string) {
		super(
			`Model ${modelId} not found for provider ${provider}`,
			'MODEL_NOT_FOUND',
			false,
			'Please check the model ID or select a different model',
			{ modelId, provider }
		);
	}
}

export class InvalidRequestError extends BYOKError {
	constructor(message: string, provider: string, details?: Record<string, any>) {
		super(
			message,
			'INVALID_REQUEST',
			false,
			'Please check your request parameters',
			{ ...details, provider }
		);
	}
}

export class QuotaExceededError extends BYOKError {
	constructor(provider: string, quotaType: 'tokens' | 'requests' | 'cost') {
		super(
			`${quotaType} quota exceeded for ${provider}`,
			'QUOTA_EXCEEDED',
			false,
			'Please upgrade your plan or wait for quota reset',
			{ provider, quotaType }
		);
	}
}

/**
 * Retry strategy with exponential backoff
 */
export interface RetryOptions {
	maxRetries: number;
	initialDelayMs: number;
	maxDelayMs: number;
	backoffMultiplier: number;
	shouldRetry?: (error: any) => boolean;
	onRetry?: (attempt: number, error: any, nextDelayMs: number) => void;
}

export class RetryStrategy {
	private static readonly DEFAULT_OPTIONS: RetryOptions = {
		maxRetries: 3,
		initialDelayMs: 1000,
		maxDelayMs: 30000,
		backoffMultiplier: 2,
		shouldRetry: (error) => {
			if (error instanceof BYOKError) {
				return error.isRetryable;
			}
			// Retry on network errors
			return error.code === 'ECONNRESET' ||
				error.code === 'ETIMEDOUT' ||
				error.code === 'ENOTFOUND';
		}
	};

	async executeWithRetry<T>(
		fn: () => Promise<T>,
		options: Partial<RetryOptions> = {}
	): Promise<T> {
		const opts = { ...RetryStrategy.DEFAULT_OPTIONS, ...options };
		let lastError: any;

		for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error;

				const shouldRetry = opts.shouldRetry ? opts.shouldRetry(error) : true;
				if (attempt === opts.maxRetries || !shouldRetry) {
					throw error;
				}

				// Calculate delay with exponential backoff
				const baseDelay = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);
				const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
				const delay = Math.min(baseDelay + jitter, opts.maxDelayMs);

				// Call retry callback if provided
				if (opts.onRetry) {
					opts.onRetry(attempt + 1, error, delay);
				}

				await this.delay(delay);
			}
		}

		throw lastError;
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

/**
 * Error context for better debugging
 */
export class ErrorContext {
	private static contexts = new WeakMap<Error, ErrorContext>();

	constructor(
		public readonly provider: string,
		public readonly operation: string,
		public readonly modelId?: string,
		public readonly requestId?: string,
		public readonly startTime: Date = new Date()
	) { }

	static attach(error: Error, context: ErrorContext): void {
		this.contexts.set(error, context);
	}

	static get(error: Error): ErrorContext | undefined {
		return this.contexts.get(error);
	}

	getDuration(): number {
		return Date.now() - this.startTime.getTime();
	}

	toJSON() {
		return {
			provider: this.provider,
			operation: this.operation,
			modelId: this.modelId,
			requestId: this.requestId,
			duration: this.getDuration()
		};
	}
}

/**
 * Provider-specific error mappers
 */
export class ErrorMapper {
	static mapAnthropicError(error: any): BYOKError {
		const status = error.status || error.response?.status;
		const message = error.error?.message || error.message;

		switch (status) {
			case 401:
				return new AuthenticationError('Anthropic', { status });
			case 429:
				const retryAfter = error.response?.headers?.['retry-after'];
				return new RateLimitError('Anthropic', retryAfter);
			case 404:
				return new ModelNotFoundError(error.model || 'unknown', 'Anthropic');
			case 400:
				return new InvalidRequestError(message, 'Anthropic', { status });
			default:
				if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
					return new NetworkError('Anthropic', error);
				}
				return new BYOKError(message, 'UNKNOWN_ERROR', false, undefined, { status });
		}
	}

	static mapOpenAIError(error: any): BYOKError {
		const status = error.status || error.response?.status;
		const code = error.error?.code || error.code;

		switch (code) {
			case 'invalid_api_key':
				return new AuthenticationError('OpenAI', { code });
			case 'rate_limit_exceeded':
				return new RateLimitError('OpenAI');
			case 'model_not_found':
				return new ModelNotFoundError(error.model || 'unknown', 'OpenAI');
			case 'quota_exceeded':
				return new QuotaExceededError('OpenAI', 'tokens');
			default:
				if (status === 503) {
					return new BYOKError('OpenAI service unavailable', 'SERVICE_UNAVAILABLE', true);
				}
				return new BYOKError(error.message, 'UNKNOWN_ERROR', false, undefined, { code, status });
		}
	}

	static mapGeminiError(error: any): BYOKError {
		const status = error.status || error.response?.status;
		const reason = error.error?.error?.reason;

		switch (reason) {
			case 'API_KEY_INVALID':
				return new AuthenticationError('Gemini');
			case 'RATE_LIMIT_EXCEEDED':
				return new RateLimitError('Gemini');
			case 'RESOURCE_EXHAUSTED':
				return new QuotaExceededError('Gemini', 'requests');
			default:
				if (status === 404) {
					return new ModelNotFoundError(error.model || 'unknown', 'Gemini');
				}
				return new BYOKError(error.message, 'UNKNOWN_ERROR', false, undefined, { reason, status });
		}
	}
}
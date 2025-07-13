import * as vscode from 'vscode';

/**
 * UI enhancements for model selection and management
 */

export interface ModelSelectionProgress {
	currentStep: number;
	totalSteps: number;
	stepName: string;
	canGoBack: boolean;
	canGoNext: boolean;
}

export interface ModelComparisonFeatures {
	contextLength: number;
	hasVision: boolean;
	hasTools: boolean;
	costPer1kTokens: number;
	responseTime: 'fast' | 'medium' | 'slow';
	supportedLanguages?: string[];
	specialCapabilities?: string[];
}

export interface ModelComparison {
	models: Array<{
		id: string;
		name: string;
		provider: string;
		features: ModelComparisonFeatures;
	}>;
}

/**
 * Enhanced quick pick with progress indicators
 */
export class ProgressiveQuickPick {
	private quickPick: vscode.QuickPick<vscode.QuickPickItem>;
	private progress: ModelSelectionProgress;

	constructor(
		private title: string,
		private placeholder: string
	) {
		this.quickPick = vscode.window.createQuickPick();
		this.progress = {
			currentStep: 1,
			totalSteps: 1,
			stepName: '',
			canGoBack: false,
			canGoNext: false
		};
	}

	show(
		items: vscode.QuickPickItem[],
		progress: ModelSelectionProgress
	): Promise<vscode.QuickPickItem | undefined> {
		this.progress = progress;
		this.updateUI(items);

		return new Promise((resolve) => {
			this.quickPick.onDidAccept(() => {
				const selection = this.quickPick.activeItems[0];
				resolve(selection);
				this.quickPick.hide();
			});

			this.quickPick.onDidHide(() => {
				resolve(undefined);
				this.quickPick.dispose();
			});

			this.quickPick.show();
		});
	}

	private updateUI(items: vscode.QuickPickItem[]) {
		// Update title with progress
		this.quickPick.title = `${this.title} (Step ${this.progress.currentStep}/${this.progress.totalSteps}: ${this.progress.stepName})`;
		this.quickPick.placeholder = this.placeholder;
		this.quickPick.items = items;

		// Add navigation buttons
		this.quickPick.buttons = [];
		if (this.progress.canGoBack) {
			this.quickPick.buttons.push({
				iconPath: new vscode.ThemeIcon('arrow-left'),
				tooltip: 'Go Back'
			});
		}

		// Show progress in the quick pick
		this.quickPick.step = this.progress.currentStep;
		this.quickPick.totalSteps = this.progress.totalSteps;
	}

	dispose() {
		this.quickPick.dispose();
	}
}

/**
 * Model comparison view
 */
export class ModelComparisonView {
	static async show(models: ModelComparison): Promise<string | undefined> {
		// Create comparison table
		const comparisonItems = models.models.map(model => {
			const features = model.features;
			const icons = [];

			if (features.hasVision) icons.push('👁️');
			if (features.hasTools) icons.push('🔧');
			if (features.responseTime === 'fast') icons.push('⚡');

			const cost = features.costPer1kTokens < 0.01 ? '$' :
				features.costPer1kTokens < 0.1 ? '$$' : '$$$';

			return {
				label: model.name,
				description: `${model.provider} • ${features.contextLength.toLocaleString()} tokens`,
				detail: `${icons.join(' ')} ${cost} • ${features.responseTime} response`,
				modelId: model.id
			} as vscode.QuickPickItem & { modelId: string };
		});

		// Add comparison header
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = 'Compare Models';
		quickPick.placeholder = 'Select a model based on your requirements';
		quickPick.items = [
			{
				label: '📊 Feature Comparison',
				kind: vscode.QuickPickItemKind.Separator
			},
			...comparisonItems
		];

		// Add filtering options
		quickPick.buttons = [
			{
				iconPath: new vscode.ThemeIcon('filter'),
				tooltip: 'Filter by features'
			}
		];

		return new Promise((resolve) => {
			quickPick.onDidAccept(() => {
				const selection = quickPick.activeItems[0] as any;
				resolve(selection?.modelId);
				quickPick.hide();
			});

			quickPick.onDidHide(() => {
				resolve(undefined);
				quickPick.dispose();
			});

			quickPick.show();
		});
	}
}

/**
 * Enhanced input box with validation
 */
export class ValidatedInputBox {
	static async show(options: {
		title: string;
		placeholder: string;
		validateInput: (value: string) => string | undefined;
		password?: boolean;
		buttons?: vscode.QuickInputButton[];
	}): Promise<string | undefined> {
		const inputBox = vscode.window.createInputBox();
		inputBox.title = options.title;
		inputBox.placeholder = options.placeholder;
		inputBox.password = options.password || false;
		inputBox.validationMessage = undefined;

		if (options.buttons) {
			inputBox.buttons = options.buttons;
		}

		// Real-time validation
		inputBox.onDidChangeValue((value) => {
			const validationMessage = options.validateInput(value);
			inputBox.validationMessage = validationMessage;
		});

		return new Promise((resolve) => {
			inputBox.onDidAccept(() => {
				const value = inputBox.value;
				const validationMessage = options.validateInput(value);

				if (!validationMessage) {
					resolve(value);
					inputBox.hide();
				} else {
					inputBox.validationMessage = validationMessage;
				}
			});

			inputBox.onDidHide(() => {
				resolve(undefined);
				inputBox.dispose();
			});

			inputBox.show();
		});
	}
}

/**
 * Status bar item for BYOK status
 */
export class BYOKStatusBar {
	private statusBarItem: vscode.StatusBarItem;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		this.statusBarItem.command = 'byok.showStatus';
	}

	updateStatus(status: {
		activeModel?: string;
		provider?: string;
		isConnected: boolean;
		error?: string;
	}) {
		if (status.error) {
			this.statusBarItem.text = `$(error) BYOK: ${status.error}`;
			this.statusBarItem.color = new vscode.ThemeColor('errorForeground');
			this.statusBarItem.tooltip = `Error: ${status.error}`;
		} else if (status.activeModel) {
			this.statusBarItem.text = `$(sparkle) ${status.provider}: ${status.activeModel}`;
			this.statusBarItem.color = status.isConnected ?
				new vscode.ThemeColor('terminal.ansiGreen') :
				new vscode.ThemeColor('terminal.ansiYellow');
			this.statusBarItem.tooltip = status.isConnected ?
				'Connected to BYOK model' :
				'Connecting to BYOK model...';
		} else {
			this.statusBarItem.text = '$(sparkle) BYOK: No model selected';
			this.statusBarItem.color = undefined;
			this.statusBarItem.tooltip = 'Click to select a model';
		}

		this.statusBarItem.show();
	}

	dispose() {
		this.statusBarItem.dispose();
	}
}

/**
 * Progress notification for long-running operations
 */
export class ProgressNotification {
	static async withProgress<T>(
		title: string,
		task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
	): Promise<T> {
		return vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title,
				cancellable: true
			},
			async (progress, token) => {
				// Add cancel support
				token.onCancellationRequested(() => {
					vscode.window.showInformationMessage(`${title} was cancelled`);
				});

				return task(progress);
			}
		);
	}
}
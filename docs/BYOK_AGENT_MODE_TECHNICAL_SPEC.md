# BYOK Agent Mode Technical Specification

## Executive Summary

This document provides a comprehensive technical specification for the existing BYOK (Bring Your Own Key) implementation that supports multiple AI models in agent mode within VSCode Copilot Chat. The system already provides extensive support for various AI providers including Claude, GPT-4, Gemini, and others, with seamless integration into the agent mode workflow.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Supported AI Providers](#supported-ai-providers)
3. [Agent Mode Integration](#agent-mode-integration)
4. [BYOK System Components](#byok-system-components)
5. [Model Registration Workflow](#model-registration-workflow)
6. [API Key Management](#api-key-management)
7. [Tool Calling and Capabilities](#tool-calling-and-capabilities)
8. [User Interface Flow](#user-interface-flow)
9. [Extension Points](#extension-points)
10. [Implementation Guidelines](#implementation-guidelines)

## Architecture Overview

The BYOK system is built as a modular contribution to the VSCode Copilot Chat extension, allowing users to register and use their own API keys with various AI model providers while maintaining full agent mode functionality.

### Core Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    VSCode Copilot Chat                      │
├─────────────────────────────────────────────────────────────┤
│                     Agent Mode                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   AgentIntent   │  │  Tool Calling   │  │   Prompts    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                     BYOK System                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ BYOKContrib     │  │ Model Registry  │  │ UI Service   │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                   Provider Layer                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │ Anthropic│ │ OpenAI  │ │ Gemini  │ │ Azure   │ │  ...   │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Files and Locations

- **Agent Mode Implementation**: `src/extension/intents/node/agentIntent.ts`
- **BYOK Contribution**: `src/extension/byok/vscode-node/byokContribution.ts`
- **Provider Interface**: `src/extension/byok/common/byokProvider.ts`
- **UI Service**: `src/extension/byok/vscode-node/byokUIService.ts`
- **Storage Service**: `src/extension/byok/vscode-node/byokStorageService.ts`

## Supported AI Providers

The system currently supports the following AI providers with agent mode capabilities:

### 1. Anthropic (Claude)
- **Models**: Claude-3.5-sonnet, Claude-3-opus, Claude-3-haiku
- **Features**: Tool calling, vision, streaming
- **Auth Type**: Global API Key
- **Implementation**: `src/extension/byok/vscode-node/anthropicProvider.ts`

### 2. OpenAI
- **Models**: GPT-4, GPT-4-turbo, GPT-3.5-turbo
- **Features**: Tool calling, vision, streaming
- **Auth Type**: Global API Key
- **Implementation**: `src/extension/byok/vscode-node/openAIProvider.ts`

### 3. Google Gemini
- **Models**: Gemini-1.5-pro, Gemini-1.0-pro
- **Features**: Tool calling, vision, streaming
- **Auth Type**: Global API Key
- **Implementation**: `src/extension/byok/vscode-node/geminiProvider.ts`

### 4. Azure OpenAI
- **Models**: Custom deployments
- **Features**: Tool calling, vision, streaming
- **Auth Type**: Per-Model Deployment (URL + API Key)
- **Implementation**: `src/extension/byok/vscode-node/azureProvider.ts`

### 5. Additional Providers
- **Groq**: High-speed inference
- **Cerebras**: Large context windows
- **Ollama**: Local model hosting
- **OpenRouter**: Model marketplace

## Agent Mode Integration

### AgentIntent Class

The `AgentIntent` class (`src/extension/intents/node/agentIntent.ts`) is the core component that handles agent mode functionality:

```typescript
export class AgentIntent extends EditCodeIntent {
    static override readonly ID = Intent.Agent;

    override async handleRequest(
        conversation: Conversation,
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: CancellationToken,
        documentContext: IDocumentContext | undefined,
        agentName: string,
        location: ChatLocation,
        chatTelemetry: ChatTelemetryBuilder,
        onPaused: Event<boolean>
    ): Promise<vscode.ChatResult>
}
```

### Tool Integration

Agent mode supports various tools that are automatically detected based on model capabilities:

```typescript
const getTools = (instaService: IInstantiationService, request: vscode.ChatRequest) => {
    // Tools include:
    // - EditFile: File editing capabilities
    // - ReplaceString: String replacement in files
    // - ApplyPatch: Git patch application
    // - RunTests: Test execution
    // - RunTask: VS Code task execution
    // - RunInTerminal: Terminal command execution
}
```

### Model Capability Detection

The system automatically detects which tools are available based on the model's capabilities:

```typescript
export function chatModelInfoToProviderMetadata(
    chatModelInfo: IChatModelInformation
): ChatResponseProviderMetadata {
    return {
        capabilities: {
            agentMode: chatModelInfo.capabilities.supports.tool_calls,
            toolCalling: chatModelInfo.capabilities.supports.tool_calls,
            vision: chatModelInfo.capabilities.supports.vision,
        }
    };
}
```

## BYOK System Components

### 1. BYOKContrib (Main Contribution)

The `BYOKContrib` class manages the entire BYOK system:

- **Responsibilities**:
  - Provider registration and management
  - Model restoration on startup
  - Authentication state handling
  - Command registration (`github.copilot.chat.manageModels`)

- **Key Methods**:
  - `registerModel()`: Registers a model with a provider
  - `deregisterModel()`: Removes a model registration
  - `restoreModels()`: Restores models from storage on startup

### 2. Provider Registries

Each AI provider implements the `BYOKModelRegistry` interface:

```typescript
export interface BYOKModelRegistry {
    readonly name: string;
    readonly authType: BYOKAuthType;
    updateKnownModelsList(knownModels: BYOKKnownModels | undefined): void;
    getAllModels(apiKey?: string): Promise<{ id: string; name: string }[]>;
    registerModel(config: BYOKModelConfig): Promise<Disposable>;
}
```

### 3. Authentication Types

Three authentication patterns are supported:

```typescript
export const enum BYOKAuthType {
    GlobalApiKey,        // Single API key for all models (OpenAI, Anthropic)
    PerModelDeployment,  // URL + API key per model (Azure)
    None                 // No authentication (Ollama)
}
```

### 4. Storage Service

The `BYOKStorageService` handles persistent storage of:
- API keys (encrypted)
- Model configurations
- Custom model definitions
- Provider settings

## Model Registration Workflow

### 1. User Interface Flow

```
User Command → Provider Selection → Model Selection → Configuration → Registration
```

1. **Command Execution**: User runs `github.copilot.chat.manageModels`
2. **Provider Selection**: Choose from available providers
3. **API Key Input**: Enter provider API key (if required)
4. **Model Selection**: Select from available models or add custom
5. **Advanced Configuration**: Configure model capabilities (optional)
6. **Registration**: Register model with VS Code language model system

### 2. Configuration States

The system uses a state machine for configuration:

```typescript
enum ConfigurationStep {
    ProviderSelection,
    ModelSelection,
    ModelId,
    DeploymentUrl,      // For Azure
    AdvancedConfig,
    FriendlyName,
    InputTokens,
    OutputTokens,
    ToolCalling,
    Vision,
    Complete
}
```

### 3. Model Configuration Structure

```typescript
export interface ModelConfig {
    id: string;
    apiKey: string;
    isCustomModel: boolean;
    modelCapabilities?: BYOKModelCapabilities;
    deploymentUrl?: string;  // For Azure deployments
}
```

## API Key Management

### Security Features

1. **Encrypted Storage**: API keys are stored encrypted in VS Code's secret storage
2. **Memory Protection**: Keys are not logged or exposed in telemetry
3. **Scope Isolation**: Keys are scoped to specific providers and models
4. **Automatic Cleanup**: Keys are removed when models are unregistered

### Storage Structure

```typescript
// Global provider keys
`byok-api-key-${providerName}`

// Per-model keys (for Azure)
`byok-api-key-${providerName}-${modelId}`

// Model configurations
`byok-model-config-${providerName}`
```

## Tool Calling and Capabilities

### Supported Tools

The agent mode supports various tools based on model capabilities:

| Tool | Purpose | Model Requirement |
|------|---------|-------------------|
| EditFile | File content editing | Tool calling support |
| ReplaceString | String replacement | Tool calling support |
| ApplyPatch | Git patch application | Tool calling support |
| RunTests | Test execution | Tool calling support |
| RunTask | VS Code task execution | Tool calling support |
| RunInTerminal | Terminal commands | Tool calling support |

### Tool Selection Logic

```typescript
const allowTools: Record<string, boolean> = {};
allowTools[ToolName.EditFile] = true;
allowTools[ToolName.ReplaceString] = modelSupportsReplaceString(model);
allowTools[ToolName.ApplyPatch] = modelSupportsApplyPatch(model) && applyPatchConfigEnabled;
allowTools[ToolName.RunTests] = await testService.hasAnyTests();
allowTools[ToolName.RunTask] = configurationService.getConfig(ConfigKey.AgentCanRunTasks);
```

### Model-Specific Tool Preferences

Different models have different tool preferences:

- **Claude**: Prefers `replace_string` tool for precise edits
- **GPT-4.1/o-series**: Prefers `apply_patch` for larger changes
- **Gemini**: Supports `replace_string` with experimental flag

## User Interface Flow

### Model Management UI

The BYOK system provides a comprehensive UI for model management:

1. **Provider Selection Screen**
   - List of available providers
   - Provider descriptions and capabilities
   - Authentication requirements

2. **Model Selection Screen**
   - Available models for selected provider
   - Custom model addition
   - Model capability indicators

3. **Configuration Screens**
   - API key input (masked)
   - Deployment URL (for Azure)
   - Advanced capability configuration

4. **Management Screen**
   - Registered models list
   - Enable/disable models
   - Delete custom models
   - Update API keys

### Command Integration

The system integrates with VS Code through:

- **Command Palette**: `github.copilot.chat.manageModels`
- **Settings**: Model configurations accessible in settings
- **Status Bar**: Model selection indicator (if implemented)

## Extension Points

### Adding New Providers

To add a new AI provider:

1. **Create Provider Registry**:
   ```typescript
   export class NewProviderRegistry implements BYOKModelRegistry {
       public readonly authType = BYOKAuthType.GlobalApiKey;
       public readonly name = 'NewProvider';
       
       async getAllModels(apiKey: string): Promise<{ id: string; name: string }[]> {
           // Implementation
       }
       
       async registerModel(config: BYOKModelConfig): Promise<Disposable> {
           // Implementation
       }
   }
   ```

2. **Create Chat Provider**:
   ```typescript
   export class NewProviderChatProvider implements LanguageModelChatProvider {
       async provideLanguageModelResponse(/* parameters */): Promise<void> {
           // Implementation
       }
   }
   ```

3. **Register in BYOKContrib**:
   ```typescript
   this._modelRegistries.push(instantiationService.createInstance(NewProviderRegistry));
   ```

### Model Capability Extensions

Model capabilities can be extended by modifying:

```typescript
export interface BYOKModelCapabilities {
    name: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    toolCalling: boolean;
    vision: boolean;
    // Add new capabilities here
}
```

## Implementation Guidelines

### Best Practices

1. **Error Handling**
   - Graceful degradation when providers are unavailable
   - Clear error messages for configuration issues
   - Retry logic for transient failures

2. **Performance**
   - Lazy loading of provider libraries
   - Efficient token counting
   - Streaming response handling

3. **Security**
   - Never log API keys
   - Use VS Code's secret storage
   - Validate input parameters

4. **User Experience**
   - Progressive disclosure in UI
   - Clear capability indicators
   - Helpful validation messages

### Code Organization

```
src/extension/byok/
├── common/
│   └── byokProvider.ts          # Core interfaces and types
├── vscode-node/
│   ├── byokContribution.ts      # Main BYOK contribution
│   ├── byokUIService.ts         # User interface service
│   ├── byokStorageService.ts    # Storage management
│   ├── anthropicProvider.ts     # Anthropic implementation
│   ├── openAIProvider.ts        # OpenAI implementation
│   ├── geminiProvider.ts        # Gemini implementation
│   ├── azureProvider.ts         # Azure implementation
│   └── baseOpenAICompatibleProvider.ts  # Base for OpenAI-compatible APIs
```

### Testing Strategy

1. **Unit Tests**: Test individual provider implementations
2. **Integration Tests**: Test BYOK system integration
3. **UI Tests**: Test model management flows
4. **Agent Mode Tests**: Test tool calling with BYOK models

## Agent Mode Prompting System

### Prompt Architecture

The agent mode uses a sophisticated prompting system built with the `@vscode/prompt-tsx` library:

```typescript
// Core agent prompt structure
export class AgentPrompt extends PromptElement<AgentPromptProps> {
    async render(state: void, sizing: PromptSizing) {
        const instructions = this.configurationService.getConfig(ConfigKey.Internal.SweBenchAgentPrompt) ?
            <SweBenchAgentPrompt /> :
            <DefaultAgentPrompt
                availableTools={this.props.promptContext.tools?.availableTools}
                modelFamily={this.props.endpoint.family}
                codesearchMode={this.props.codesearchMode}
            />;
        
        return <>
            <SystemMessage>
                <CopilotIdentityRules />
                <SafetyRules />
            </SystemMessage>
            {instructions}
            <UserMessage>
                <CustomInstructions />
                <AgentUserMessage />
                <ChatToolCalls />
            </UserMessage>
        </>;
    }
}
```

### Dynamic Tool Instructions

The system provides model-specific instructions based on available tools:

```typescript
// Tool-specific instructions are dynamically generated
const hasTerminalTool = !!availableTools?.find(tool => tool.name === ToolName.RunInTerminal);
const hasReplaceStringTool = !!availableTools?.find(tool => tool.name === ToolName.ReplaceString);
const hasEditFileTool = !!availableTools?.find(tool => tool.name === ToolName.EditFile);

// Instructions adapt based on tool availability
if (hasTerminalTool) {
    instructions.push("NEVER print out a codeblock with a terminal command. Use the RunInTerminal tool instead.");
}
```

### Context Management

The agent prompt includes sophisticated context management:

1. **Global Context**: Environment info, workspace structure, user preferences
2. **Turn Context**: Current request, variables, tool references
3. **Historical Context**: Conversation history with summarization
4. **Dynamic Context**: Current editor state, git repository info

## Performance and Optimization

### Token Budget Management

The system implements intelligent token budget management:

```typescript
const baseBudget = Math.min(
    this.configurationService.getConfig(ConfigKey.Internal.SummarizeAgentConversationHistoryThreshold) ?? 
    this.endpoint.modelMaxPromptTokens,
    this.endpoint.modelMaxPromptTokens
);

// Reserve space for tools
const toolTokens = tools?.length ? await this.endpoint.acquireTokenizer().countToolTokens(tools) : 0;
const safeBudget = Math.floor((baseBudget - toolTokens) * 0.85);
```

### Conversation Summarization

For long conversations, the system implements automatic summarization:

- **Trigger Condition**: When prompt budget is exceeded
- **Strategy**: Summarize older turns while preserving recent context
- **Tool Integration**: Maintains tool call results across summarization

### Streaming and Caching

- **Response Streaming**: All providers support streaming responses
- **Prompt Caching**: Implements cache breakpoints for repeated context
- **Token Counting**: Efficient token counting per provider

## Error Handling and Resilience

### Provider Error Handling

Each provider implements robust error handling:

```typescript
try {
    const result = await this._makeRequest(progress, params, token);
    pendingLoggedChatRequest.resolve({
        type: ChatFetchResponseType.Success,
        // ... success response
    });
} catch (err) {
    this._logService.logger.error(`BYOK ${providerName} error: ${toErrorMessage(err, true)}`);
    pendingLoggedChatRequest.resolve({
        type: ChatFetchResponseType.Unknown,
        reason: err.message
    });
    throw err;
}
```

### Fallback Strategies

1. **Model Fallback**: Graceful degradation when models are unavailable
2. **Tool Fallback**: Disable specific tools if model doesn't support them
3. **Authentication Fallback**: Clear error messages for auth failures
4. **Network Fallback**: Retry logic for transient network issues

## Security Considerations

### API Key Security

1. **Storage Encryption**: All API keys stored in VS Code's secure storage
2. **Memory Protection**: Keys cleared from memory after use
3. **Logging Protection**: Keys never logged or sent in telemetry
4. **Transport Security**: HTTPS only for all API communications

### Input Validation

```typescript
// Validate all user inputs
if (options.validateInput) {
    const validation = options.validateInput(value);
    if (validation) {
        inputBox.validationMessage = (await validation) || undefined;
        return;
    }
}
```

### Rate Limiting and Quotas

- **Provider Rate Limits**: Respect individual provider rate limits
- **User Quotas**: Optional quota management per provider
- **Error Handling**: Graceful handling of quota exceeded errors

## Telemetry and Monitoring

### Usage Tracking

The system tracks comprehensive usage metrics:

```typescript
/* __GDPR__
    "byokModelUsage" : {
        "provider": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
        "modelId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
        "toolsUsed": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
        "success": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
    }
*/
```

### Performance Metrics

- **Time to First Token (TTFT)**: Measured for all providers
- **Total Response Time**: End-to-end response timing
- **Token Usage**: Input/output token consumption
- **Tool Call Latency**: Individual tool execution times

## Configuration Options

### User-Configurable Settings

```typescript
// Available configuration options
export const enum ConfigKey {
    AgentCanRunTasks = 'chat.agent.canRunTasks',
    AgentTemperature = 'internal.agentTemperature',
    CurrentEditorAgentContext = 'chat.agent.currentEditorContext',
    OllamaEndpoint = 'chat.byok.ollamaEndpoint',
    EnableApplyPatchTool = 'internal.enableApplyPatchTool',
    SummarizeAgentConversationHistory = 'internal.summarizeAgentConversationHistory'
}
```

### Provider-Specific Configuration

Each provider can be configured with:

- **Model-specific settings**: Context windows, token limits
- **Tool preferences**: Which tools to enable/disable
- **Performance tuning**: Temperature, top-p, other sampling parameters
- **Custom endpoints**: For self-hosted or enterprise deployments

## Future Enhancement Opportunities

### Planned Features

1. **Model Comparison**: Side-by-side model comparison for the same task
2. **Custom Tool Creation**: User-defined tools for specific workflows
3. **Workspace Templates**: Pre-configured model sets for different project types
4. **Collaborative Features**: Team sharing of model configurations

### Architecture Extensions

1. **Plugin System**: Third-party provider plugins
2. **Custom Endpoints**: Support for self-hosted models
3. **Multi-Modal Support**: Enhanced vision and audio capabilities
4. **Workflow Automation**: Automated model selection based on task type

## Troubleshooting Guide

### Common Issues

1. **API Key Issues**
   - **Symptom**: "Authentication failed" error
   - **Solution**: Verify API key validity and permissions
   - **Debug**: Check VS Code's secret storage

2. **Model Registration Failures**
   - **Symptom**: Model doesn't appear in selection
   - **Solution**: Check provider availability and model limits
   - **Debug**: Review extension logs for registration errors

3. **Tool Calling Issues**
   - **Symptom**: Agent doesn't use tools effectively
   - **Solution**: Verify model supports tool calling
   - **Debug**: Check tool availability and configuration

### Debug Information

Enable debug logging with:

```typescript
// Set log level to trace for detailed debugging
this._logService.logger.setLevel(LogLevel.Trace);
```

## Conclusion

The VSCode Copilot Chat BYOK system provides a comprehensive solution for using multiple AI models in agent mode. The modular architecture allows for easy extension while maintaining security and user experience standards. The existing implementation already supports major AI providers and provides a solid foundation for future enhancements.

### Key Strengths

1. **Modular Design**: Easy to add new providers and capabilities
2. **Security First**: Comprehensive API key management and protection
3. **User Experience**: Intuitive model management and configuration
4. **Performance**: Efficient token usage and streaming responses
5. **Flexibility**: Support for different authentication patterns and model types

### For Developers

When contributing to or extending the system:

1. Follow the established provider registry pattern
2. Implement proper error handling and security measures
3. Maintain consistency with existing UI patterns
4. Ensure compatibility with the agent mode tool calling system
5. Add comprehensive tests for new functionality

The system demonstrates excellent separation of concerns and provides a robust foundation for multi-model AI assistance in VS Code.
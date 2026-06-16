import { Effect, Layer, Context, Redacted, Stream } from 'effect';
import { LanguageModel, Model, AiError, Response } from 'effect/unstable/ai';
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpBody } from 'effect/unstable/http';


// Service definition for cortecs configuration
export class CortecsConfig extends Context.Service<
  CortecsConfig,
  {
    readonly apiKey: Redacted.Redacted;
    readonly baseUrl: string;
    readonly model: string;
  }
>()('app/cortecs/CortecsConfig') {}



interface ChatRequest {
  readonly model: string;
  readonly messages: ReadonlyArray<{ role: string; content: string }>;
  readonly maxTokens?: number;
}

interface ChatResponse {
  readonly content: string;
  readonly finishReason: string;
}

/** 
  * i doubt this is needed
*/
function mapFinishReason (reason: string): Response.FinishReason  {
  switch (reason) {
    case 'stop': return 'stop' as Response.FinishReason;
    case 'length': return 'length' as Response.FinishReason;
    default: return 'stop' as Response.FinishReason;
  }
};


/**
  * Client service definition for the cortecs cient, to be used for the ai prompt service
  */
export class CortecsClient extends Context.Service<
  CortecsClient,
  {
    readonly createCompletion: (request: ChatRequest) => Effect.Effect<ChatResponse, AiError.AiError>;
  }
>()('app/cortecs/CortecsClient') {}


const CortecsClientLayer = Layer.effect(
  CortecsClient,
  Effect.gen(function* () {
    const config = yield* CortecsConfig;
    const baseClient = yield* HttpClient.HttpClient;

    const apiUrl = config.baseUrl.replace(/\/$/, '');
    const httpClient = baseClient.pipe(
      HttpClient.mapRequest((req) =>
        HttpClientRequest.prependUrl(apiUrl)(
          HttpClientRequest.bearerToken(config.apiKey)(
            HttpClientRequest.acceptJson(req),
          ),
        ),
      ),
      HttpClient.filterStatusOk,
    );

    const createCompletion = Effect.fn('CortecsClient.createCompletion')(
      function* (request: ChatRequest) {
        const payload = {
          model: request.model,
          messages: request.messages,
          max_tokens: request.maxTokens ?? 1024,
        };

        const response = yield* httpClient
          .execute(
            HttpClientRequest.post('/chat/completions', {
              body: HttpBody.jsonUnsafe(payload),
            }),
          )
          .pipe(
            Effect.catch((error: unknown) =>
              Effect.fail(AiError.make({
                module: 'Cortecs',
                method: 'createCompletion',
                reason: new AiError.NetworkError({
                  reason: 'TransportError',
                  request: {
                    method: 'POST',
                    url: `${apiUrl}/chat/completions`,
                    urlParams: [],
                    hash: undefined,
                    headers: {},
                  },
                  description: `HTTP error: ${error}`,
                }),
              })),
            ),
          );

        const json: any = yield* response.json.pipe(
          Effect.mapError((error) =>
            AiError.make({
              module: 'Cortecs',
              method: 'createCompletion',
              reason: new AiError.InvalidOutputError({
                description: `Failed to parse response: ${error}`,
              }),
            }),
          ),
        );

        const choice = json?.choices?.[0];
        if (!choice) {
          return yield* Effect.fail(AiError.make({
            module: 'Cortecs',
            method: 'createCompletion',
            reason: new AiError.InvalidOutputError({
              description: 'No choices returned from API',
            }),
          }));
        }

        return {
          content: choice.message?.content ?? '',
          finishReason: choice.finish_reason ?? 'stop',
        };
      },
    );

    return CortecsClient.of({ createCompletion });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));


const textFromMessage = (
  message: { readonly role: string; readonly content: string | ReadonlyArray<any> },
): string => {
  if (typeof message.content === 'string') return message.content;
  return message.content
    .filter((p: any) => p.type === 'text' && p.text !== undefined)
    .map((p: any) => p.text)
    .join('\n');
};


const CortecsLanguageModelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  Effect.gen(function* () {
    const client = yield* CortecsClient;
    const config = yield* CortecsConfig;

    const model = yield* LanguageModel.make({
      generateText: (options) =>
        Effect.gen(function* () {
          const prompt = options.incrementalPrompt ?? options.prompt;
          const messages = prompt.content.map((m) => ({
            role: m.role,
            content: textFromMessage(m as any),
          }));

          const result = yield* client.createCompletion({ model: config.model, messages });

          return [
            { type: 'text', text: result.content } as Response.PartEncoded,
            {
              type: 'finish',
              reason: mapFinishReason(result.finishReason),
              usage: {
                inputTokens: { uncached: undefined, total: 0, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 0, text: undefined, reasoning: undefined },
              },
              response: undefined,
            } as Response.PartEncoded,
          ];
        }),
      streamText: (options) =>
        Stream.flattenIterable(
          Stream.fromEffect(
            Effect.gen(function* () {
              const prompt = options.incrementalPrompt ?? options.prompt;
              const messages = prompt.content.map((m) => ({
                role: m.role,
                content: textFromMessage(m as any),
              }));

              const result = yield* client.createCompletion({ model: config.model, messages });

              return [
                { type: 'text-start' as const, id: '1' },
                { type: 'text-delta' as const, id: '1', delta: result.content },
                { type: 'text-end' as const, id: '1' },
                {
                  type: 'finish' as const,
                  reason: mapFinishReason(result.finishReason),
                  usage: {
                    inputTokens: { uncached: undefined, total: 0, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: 0, text: undefined, reasoning: undefined },
                  },
                  response: undefined,
                },
              ] as ReadonlyArray<Response.StreamPartEncoded>;
            }),
          ),
        ),
    });

    return model;
  }),
).pipe(Layer.provide(CortecsClientLayer));


/**
  * Layer to use for the public, current defaults with the provider and model name.
  * For other settings, make a new layer
  */
export const CortecsLayer: Layer.Layer<
  LanguageModel.LanguageModel | Model.ProviderName | Model.ModelName,
  never,
  CortecsConfig
> = Layer.mergeAll(
  CortecsLanguageModelLayer,
  Layer.succeed(Model.ProviderName, 'cortecs'),
  Layer.succeed(Model.ModelName, 'kimi-k2.5'),
);

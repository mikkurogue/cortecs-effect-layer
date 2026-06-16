import { Effect, Layer, Context, Redacted } from 'effect';
import { LanguageModel, Model, AiError } from 'effect/unstable/ai';
import { CortecsLayer, CortecsConfig } from './cortecs';

export class AiSlopper extends Context.Service<
  AiSlopper,
  {
    query(
      proompt: string,
    ): Effect.Effect<{ readonly provider: string; readonly text: string }, AiError.AiError, LanguageModel.LanguageModel | Model.ProviderName>;
  }
>()('AiSlopper') {
  static readonly layer = Layer.effect(
    AiSlopper,

    Effect.gen(function* () {
      const query = Effect.fn('AiSlopper.query')(function* (proompt: string) {
        yield* Effect.log('Executing AI prompt:', proompt);

        const response = yield* LanguageModel.generateText({
          prompt: `write a short text saying hello to ${proompt}`
        })

        const provider = yield* Model.ProviderName

        return { provider: provider, text: response.text };
      });

      return AiSlopper.of({
        query,
      });
    }),
  );
}

const program = Effect.gen(function* () {
  const db = yield* AiSlopper;

  return yield* db.query('Gorlok the destroyer');
}).pipe(
  Effect.provide(AiSlopper.layer),
  Effect.provide(CortecsLayer),
  Effect.provide(
    Layer.succeed(CortecsConfig, {
      apiKey: Redacted.make('PLACEHOLDER_KEY'),
      baseUrl: 'https://api.cortecs.ai/v1',
      model: 'kimi-k2.5',
    }),
  ),
);

Effect.runPromise(program).then(console.log, console.error);

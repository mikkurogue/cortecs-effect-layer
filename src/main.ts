import 'dotenv/config';
import ora from 'ora';
import { Effect, Layer, Context, Config } from 'effect';
import { LanguageModel, Model, AiError } from 'effect/unstable/ai';
import { CortecsLayer, CortecsConfig } from './cortecs';

const withSpinner = <A, E, R>(text: string, self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const spinner = yield* Effect.sync(() => ora({ text }).start());
    const result = yield* self.pipe(
      Effect.tap(() => Effect.sync(() => spinner.succeed())),
      Effect.tapError(() => Effect.sync(() => spinner.fail())),
    );
    return result;
  });

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
        const response = yield* withSpinner(
          'Calling Cortecs.ai...',
          LanguageModel.generateText({
            prompt: `write a short text saying hello to ${proompt}`,
          }),
        );

        const provider = yield* Model.ProviderName;

        return { provider, text: response.text };
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
    Layer.effect(
      CortecsConfig,
      Effect.gen(function* () {
        const apiKey = yield* Config.redacted('CORTECS_API_KEY');
        return {
          apiKey,
          baseUrl: 'https://api.cortecs.ai/v1',
          model: 'kimi-k2.5',
        } as const;
      }),
    ),
  ),
);

Effect.runPromise(program).then(console.log, console.error);

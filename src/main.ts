import "dotenv/config";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Effect, Layer, Context, Config } from "effect";
import { LanguageModel, Model, AiError } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";
import ora from "ora";

// ora spinner
const withSpinner = <A, E, R>(text: string, self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const spinner = yield* Effect.sync(() => ora({ text }).start());
    const result = yield* self.pipe(
      Effect.tap(() => Effect.sync(() => spinner.succeed())),
      Effect.tapError(() => Effect.sync(() => spinner.fail())),
    );
    return result;
  });

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted("CORTECS_API_KEY"),
  apiUrl: Config.succeed("https://api.cortecs.ai/v1"),
}).pipe(Layer.provide(FetchHttpClient.layer));

export class AiSlopper extends Context.Service<
  AiSlopper,
  {
    query(
      sql: string,
    ): Effect.Effect<
      { readonly provider: string; readonly text: string },
      AiError.AiError,
      LanguageModel.LanguageModel | Model.ProviderName
    >;
  }
>()("AiSlopper") {
  static readonly layer = Layer.effect(
    AiSlopper,

    Effect.gen(function* () {
      const query = Effect.fn("AiSlopper.query")(function* (sql: string) {
        yield* Effect.log("Executing AI prompt:", sql);

        const response = yield* withSpinner(
          "Calling cortecs api...",
          LanguageModel.generateText({
            prompt: `write a short text saying hello to ${sql}`,
          }),
        );

        const provider = yield* Model.ProviderName;

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

  return yield* db.query("Gorlok the destroyer");
}).pipe(
  Effect.provide(AiSlopper.layer),
  Effect.provide(OpenAiLanguageModel.model("kimi-k2.5")),
  Effect.provide(OpenAiClientLayer),
);

Effect.runPromise(program).then(console.log, console.error);

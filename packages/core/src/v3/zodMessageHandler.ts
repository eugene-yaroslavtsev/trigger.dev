import { z } from "zod";

export type ZodMessageValueSchema<TDiscriminatedUnion extends z.ZodDiscriminatedUnion<any, any>> =
  | z.ZodFirstPartySchemaTypes
  | TDiscriminatedUnion;

export interface ZodMessageCatalogSchema {
  [key: string]: ZodMessageValueSchema<any>;
}

export type ZodMessageHandlers<TCatalogSchema extends ZodMessageCatalogSchema> = Partial<{
  [K in keyof TCatalogSchema]: (payload: z.infer<TCatalogSchema[K]>) => Promise<any>;
}>;

export type ZodMessageHandlerOptions<TMessageCatalog extends ZodMessageCatalogSchema> = {
  schema: TMessageCatalog;
  messages?: ZodMessageHandlers<TMessageCatalog>;
};

type MessageFromSchema<
  K extends keyof TMessageCatalog,
  TMessageCatalog extends ZodMessageCatalogSchema,
> = {
  type: K;
  payload: z.input<TMessageCatalog[K]>;
};

type MessageFromCatalog<TMessageCatalog extends ZodMessageCatalogSchema> = {
  [K in keyof TMessageCatalog]: MessageFromSchema<K, TMessageCatalog>;
}[keyof TMessageCatalog];

const messageSchema = z.object({
  version: z.literal("v1").default("v1"),
  type: z.string(),
  payload: z.unknown(),
});

export interface EventEmitterLike {
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
}

export class ZodMessageHandler<TMessageCatalog extends ZodMessageCatalogSchema> {
  #schema: TMessageCatalog;
  #handlers: ZodMessageHandlers<TMessageCatalog> | undefined;

  constructor(options: ZodMessageHandlerOptions<TMessageCatalog>) {
    this.#schema = options.schema;
    this.#handlers = options.messages;
  }

  public async handleMessage(message: unknown) {
    const parsedMessage = this.parseMessage(message);

    if (!this.#handlers) {
      throw new Error("No handlers provided");
    }

    const handler = this.#handlers[parsedMessage.type];

    if (!handler) {
      console.error(`No handler for message type: ${String(parsedMessage.type)}`);
      return;
    }

    const ack = await handler(parsedMessage.payload);

    return ack;
  }

  public parseMessage(message: unknown): MessageFromCatalog<TMessageCatalog> {
    const parsedMessage = messageSchema.safeParse(message);

    if (!parsedMessage.success) {
      throw new Error(`Failed to parse message: ${JSON.stringify(parsedMessage.error)}`);
    }

    const schema = this.#schema[parsedMessage.data.type];

    if (!schema) {
      throw new Error(`Unknown message type: ${parsedMessage.data.type}`);
    }

    const parsedPayload = schema.safeParse(parsedMessage.data.payload);

    if (!parsedPayload.success) {
      throw new Error(`Failed to parse message payload: ${JSON.stringify(parsedPayload.error)}`);
    }

    return {
      type: parsedMessage.data.type,
      payload: parsedPayload.data,
    };
  }

  public registerHandlers(emitter: EventEmitterLike, logger?: (...args: any[]) => void) {
    const log = logger ?? console.log;

    if (!this.#handlers) {
      log("No handlers provided");
      return;
    }

    for (const eventName of Object.keys(this.#schema)) {
      emitter.on(eventName, async (message: any, callback?: any): Promise<void> => {
        log(`handling ${eventName}`, message);

        let ack;

        // FIXME: this only works if the message doesn't have genuine payload prop
        if ("payload" in message) {
          ack = await this.handleMessage({ type: eventName, ...message });
        } else {
          // Handle messages not sent by ZodMessageSender
          const { version, ...payload } = message;
          ack = await this.handleMessage({ type: eventName, version, payload });
        }

        if (callback && typeof callback === "function") {
          callback(ack);
        }
      });
    }
  }
}

type ZodMessageSenderCallback<TMessageCatalog extends ZodMessageCatalogSchema> = (message: {
  type: keyof TMessageCatalog;
  payload: z.infer<TMessageCatalog[keyof TMessageCatalog]>;
  version: "v1";
}) => Promise<void>;

export type ZodMessageSenderOptions<TMessageCatalog extends ZodMessageCatalogSchema> = {
  schema: TMessageCatalog;
  sender: ZodMessageSenderCallback<TMessageCatalog>;
};

export class ZodMessageSender<TMessageCatalog extends ZodMessageCatalogSchema> {
  #schema: TMessageCatalog;
  #sender: ZodMessageSenderCallback<TMessageCatalog>;

  constructor(options: ZodMessageSenderOptions<TMessageCatalog>) {
    this.#schema = options.schema;
    this.#sender = options.sender;
  }

  public async send<K extends keyof TMessageCatalog>(
    type: K,
    payload: z.input<TMessageCatalog[K]>
  ) {
    const schema = this.#schema[type];

    if (!schema) {
      throw new Error(`Unknown message type: ${type as string}`);
    }

    const parsedPayload = schema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new Error(`Failed to parse message payload: ${JSON.stringify(parsedPayload.error)}`);
    }

    await this.#sender({ type, payload, version: "v1" });
  }
}

export type MessageCatalogToSocketIoEvents<TCatalog extends ZodMessageCatalogSchema> = {
  [K in keyof TCatalog]: (message: z.infer<TCatalog[K]>) => void;
};

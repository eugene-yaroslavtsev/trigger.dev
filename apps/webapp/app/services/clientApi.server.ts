import type {
  ApiEventLog,
  ConnectionAuth,
  RunJobBody,
  HttpSourceRequest,
  PrepareJobTriggerBody,
} from "@trigger.dev/internal";
import {
  DeliverEventResponseSchema,
  ErrorWithStackSchema,
  RunJobResponseSchema,
  GetEndpointDataResponseSchema,
  HttpSourceResponseSchema,
  PongResponseSchema,
  PrepareForJobExecutionResponseSchema,
} from "@trigger.dev/internal";
import { logger } from "./logger";

export class ClientApiError extends Error {
  constructor(message: string, stack?: string) {
    super(message);
    this.stack = stack;
    this.name = "ClientApiError";
  }
}

export class ClientApi {
  #apiKey: string;
  #url: string;

  constructor(apiKey: string, url: string) {
    this.#apiKey = apiKey;
    this.#url = url;
  }

  async ping() {
    const response = await safeFetch(this.#url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-trigger-api-key": this.#apiKey,
        "x-trigger-action": "PING",
      },
    });

    if (!response) {
      throw new Error(`Could not connect to endpoint ${this.#url}`);
    }

    if (!response.ok) {
      throw new Error(
        `Could not connect to endpoint ${this.#url}. Status code: ${
          response.status
        }`
      );
    }

    const anyBody = await response.json();

    logger.debug("ping() response from endpoint", {
      body: anyBody,
    });

    return PongResponseSchema.parse(anyBody);
  }

  async getEndpointData() {
    const response = await safeFetch(this.#url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-trigger-api-key": this.#apiKey,
      },
    });

    if (!response) {
      throw new Error(`Could not connect to endpoint ${this.#url}`);
    }

    if (!response.ok) {
      throw new Error(
        `Could not connect to endpoint ${this.#url}. Status code: ${
          response.status
        }`
      );
    }

    const anyBody = await response.json();

    logger.debug("getJobs() response from endpoint", {
      body: anyBody,
    });

    return GetEndpointDataResponseSchema.parse(anyBody);
  }

  async deliverEvent(event: ApiEventLog) {
    const response = await safeFetch(this.#url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-trigger-api-key": this.#apiKey,
        "x-trigger-action": "DELIVER_EVENT",
      },
      body: JSON.stringify(event),
    });

    if (!response) {
      throw new Error(`Could not connect to endpoint ${this.#url}`);
    }

    if (!response.ok) {
      throw new Error(
        `Could not connect to endpoint ${this.#url}. Status code: ${
          response.status
        }`
      );
    }

    const anyBody = await response.json();

    logger.debug("deliverEvent() response from endpoint", {
      body: anyBody,
    });

    return DeliverEventResponseSchema.parse(anyBody);
  }

  async executeJob(options: RunJobBody) {
    const response = await safeFetch(this.#url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-trigger-api-key": this.#apiKey,
        "x-trigger-action": "EXECUTE_JOB",
      },
      body: JSON.stringify(options),
    });

    if (!response) {
      throw new Error(`Could not connect to endpoint ${this.#url}`);
    }

    if (!response.ok) {
      // Attempt to parse the error message
      const anyBody = await response.json();

      const error = ErrorWithStackSchema.safeParse(anyBody);

      if (error.success) {
        throw new ClientApiError(error.data.message, error.data.stack);
      }

      throw new Error(
        `Could not connect to endpoint ${this.#url}. Status code: ${
          response.status
        }`
      );
    }

    const anyBody = await response.json();

    logger.debug("executeJob() response from endpoint", {
      body: anyBody,
    });

    return RunJobResponseSchema.parse(anyBody);
  }

  async prepareJobTrigger(payload: PrepareJobTriggerBody) {
    const response = await safeFetch(this.#url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-trigger-api-key": this.#apiKey,
        "x-trigger-action": "PREPARE_JOB_TRIGGER",
      },
      body: JSON.stringify(payload),
    });

    if (!response) {
      throw new Error(`Could not connect to endpoint ${this.#url}`);
    }

    if (!response.ok) {
      // Attempt to parse the error message
      const anyBody = await response.json();

      const error = ErrorWithStackSchema.safeParse(anyBody);

      if (error.success) {
        throw new ClientApiError(error.data.message, error.data.stack);
      }

      throw new Error(
        `Could not connect to endpoint ${this.#url}. Status code: ${
          response.status
        }`
      );
    }

    const anyBody = await response.json();

    logger.debug("prepareForJobExecution() response from endpoint", {
      body: anyBody,
    });

    return PrepareForJobExecutionResponseSchema.parse(anyBody);
  }

  async deliverHttpSourceRequest(options: {
    key: string;
    dynamicId?: string;
    secret: string;
    params: any;
    data: any;
    request: HttpSourceRequest;
  }) {
    const response = await safeFetch(this.#url, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-trigger-api-key": this.#apiKey,
        "x-trigger-action": "DELIVER_HTTP_SOURCE_REQUEST",
        "x-ts-key": options.key,
        "x-ts-secret": options.secret,
        "x-ts-params": JSON.stringify(options.params ?? {}),
        "x-ts-data": JSON.stringify(options.data ?? {}),
        "x-ts-http-url": options.request.url,
        "x-ts-http-method": options.request.method,
        "x-ts-http-headers": JSON.stringify(options.request.headers),
        ...(options.dynamicId && { "x-ts-dynamic-id": options.dynamicId }),
      },
      body: options.request.rawBody,
    });

    if (!response) {
      throw new Error(`Could not connect to endpoint ${this.#url}`);
    }

    if (!response.ok) {
      throw new Error(
        `Could not connect to endpoint ${this.#url}. Status code: ${
          response.status
        }`
      );
    }

    const anyBody = await response.json();

    logger.debug("deliverHttpSourceRequest() response from endpoint", {
      body: anyBody,
    });

    return HttpSourceResponseSchema.parse(anyBody);
  }
}

async function safeFetch(url: string, options: RequestInit) {
  try {
    return await fetch(url, options);
  } catch (error) {
    logger.debug("Error while trying to connect to endpoint", {
      url,
    });
  }
}

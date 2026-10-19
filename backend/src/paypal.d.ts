/**
 * Minimal ambient types for @paypal/checkout-server-sdk — the package ships
 * no .d.ts. Only the pieces the cart checkout route uses are declared.
 */
declare module "@paypal/checkout-server-sdk" {
  export namespace core {
    class SandboxEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
    class LiveEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
    class PayPalHttpClient {
      constructor(environment: SandboxEnvironment | LiveEnvironment);
      execute<T = unknown>(
        request: unknown,
      ): Promise<{ statusCode: number; result: T }>;
    }
  }

  export namespace orders {
    class OrdersCreateRequest {
      prefer(format: string): void;
      requestBody(body: unknown): void;
    }
    class OrdersCaptureRequest {
      constructor(orderId: string);
      requestBody(body: unknown): void;
    }
  }

  const paypal: {
    core: typeof core;
    orders: typeof orders;
  };
  export default paypal;
}

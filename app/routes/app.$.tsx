import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { APP_NAME } from "../lib/brand";

/**
 * Any address inside the app that matches no page, such as a removed page or a
 * mistyped link. It renders inside the app frame with the navigation intact,
 * instead of an unstyled error, and still answers with a 404 status.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  throw new Response("Not found", { status: 404 });
};

function PageNotFound() {
  return (
    <s-page heading="Page not found" inlineSize="large">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            There is nothing at this address. It may have moved, or the link may
            be out of date.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" href="/app">
              Go to {APP_NAME}
            </s-button>
            <s-button href="/app/discounts/quantity">
              Quantity based discounts
            </s-button>
            <s-button href="/app/discounts/order">
              Whole order discounts
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export default function CatchAll() {
  return <PageNotFound />;
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <PageNotFound />;
  }

  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

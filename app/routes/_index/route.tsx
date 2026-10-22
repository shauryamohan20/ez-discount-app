import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useNavigate } from "react-router";

import { APP_NAME, APP_WEBSITE_LABEL, APP_WEBSITE_URL } from "../../lib/brand";

/**
 * The app's root address. Nobody should stay here:
 *
 * - Shopify opens the app here with the shop's details, which forward
 *   straight into the app.
 * - Inside the admin, clicking the app's name while the app is open makes App
 *   Bridge navigate here without those details. clientLoader forwards into
 *   the app before anything is drawn, so the website message never flashes.
 * - A full page load inside the admin without the details is marked by the
 *   browser as a frame (Sec-Fetch-Dest: iframe), so the page renders nothing
 *   while it forwards.
 * - Anyone else, outside Shopify, is sent to the website.
 *
 * This used to be the template's form for typing a shop domain to log in.
 * Shopify App Store requirement 2.3.1 says an app must not ask for a shop's
 * domain, and installing happens from the App Store, so the form is gone.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { framed: request.headers.get("sec-fetch-dest") === "iframe" };
};

/** Navigations inside the app run this in the browser instead of the loader. */
export const clientLoader = async () => {
  // Inside the Shopify admin the app runs in a frame. Comparing the two
  // windows is allowed even though the admin is on another domain.
  if (window.top !== window.self) throw redirect("/app");

  return { framed: false };
};

export default function Root() {
  const { framed } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  useEffect(() => {
    const insideAdmin = window.top !== window.self;

    if (insideAdmin) {
      navigate("/app", { replace: true });
    } else {
      window.location.replace(APP_WEBSITE_URL);
    }
  }, [navigate]);

  // Inside the admin there is nothing to show before the forward.
  if (framed) return null;

  // Shown only for the moment before the forward, or if scripts are off.
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "48px 16px",
        textAlign: "center",
      }}
    >
      <h1>{APP_NAME}</h1>
      <p>
        Taking you to <a href={APP_WEBSITE_URL}>{APP_WEBSITE_LABEL}</a>.
      </p>
    </main>
  );
}

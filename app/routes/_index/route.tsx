import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

import styles from "./styles.module.css";
import { APP_NAME, APP_WEBSITE_LABEL, APP_WEBSITE_URL } from "../../lib/brand";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors;

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>{APP_NAME}</h1>
        <p className={styles.text}>
          Quantity tiers, whole order discounts and Buy X Get Y offers for your
          Shopify store, applied automatically or with a code.
        </p>
        {showForm && (
          <Form className={styles.form} method="post">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>{errors?.shop ?? "e.g: my-shop-domain.myshopify.com"}</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Automatic or code</strong>. Apply the discount in the cart
            on its own, or give customers a code to enter at checkout.
          </li>
          <li>
            <strong>Three kinds of discount</strong>. More off as the quantity
            grows, a percentage off orders over an amount, and buy 2 get 1 free
            style offers.
          </li>
          <li>
            <strong>In your control</strong>. Schedule a start and end date, and
            turn a discount on or off whenever you want.
          </li>
        </ul>
        <p className={styles.text}>
          Learn more at{" "}
          <a href={APP_WEBSITE_URL} target="_blank" rel="noreferrer">
            {APP_WEBSITE_LABEL}
          </a>
          .
        </p>
      </div>
    </div>
  );
}

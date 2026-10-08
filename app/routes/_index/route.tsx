import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

import styles from "./styles.module.css";

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
        <h1 className={styles.heading}>Quantity based discounts, made simple</h1>
        <p className={styles.text}>
          Reward customers for buying more. Set quantity tiers once, and the
          right percentage comes off the cart automatically.
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
            <strong>Quantity based</strong>. Give a bigger percentage off as the
            cart quantity grows, with as many tiers as you need.
          </li>
          <li>
            <strong>In your control</strong>. Schedule a start and end date, and
            turn a discount on or off whenever you want.
          </li>
        </ul>
      </div>
    </div>
  );
}

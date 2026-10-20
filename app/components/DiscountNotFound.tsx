import { APP_NAME } from "../lib/brand";

type Props = {
  /** Where the back link and button go, for example a discount tab. */
  backHref?: string;
  backLabel?: string;
};

/**
 * What every discount route shows instead of a bare 404: a deleted discount,
 * a stale link, or an ID that belongs to another app all read as a dead end
 * with a way back, rather than as a crash.
 */
export function DiscountNotFound({
  backHref = "/app",
  backLabel = `Back to ${APP_NAME}`,
}: Props) {
  return (
    <s-page heading="Discount not found" inlineSize="large">
      <s-link slot="breadcrumb-actions" href={backHref}>
        {backLabel}
      </s-link>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            This discount no longer exists, or it was not created by this app.
          </s-paragraph>
          <s-stack direction="inline">
            <s-button variant="primary" href={backHref}>
              {backLabel}
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

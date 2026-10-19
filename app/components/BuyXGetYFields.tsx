import {
  previewBxgy,
  type BxgyFormErrors,
  type BxgyFormValues,
} from "../lib/bxgy-form";
import {
  MAX_SCOPE_IDS,
  type BuyScopeKind,
  type GetScopeKind,
} from "../lib/tiers";
import { ResourceSelector } from "./ResourceSelector";

type Props = {
  values: BxgyFormValues;
  errors: BxgyFormErrors;
  disabled?: boolean;
  onChange: (values: BxgyFormValues) => void;
};

function readChoice(event: Event): string | undefined {
  const list = event.currentTarget as HTMLElementTagNameMap["s-choice-list"];
  return list.values[0];
}

/**
 * What the customer buys, what they get, at what discount, and how often. The
 * preview sentence at the end is rebuilt on every change, so the merchant can
 * read back the offer exactly as it will behave.
 */
export function BuyXGetYFields({
  values,
  errors,
  disabled = false,
  onChange,
}: Props) {
  const update = (patch: Partial<BxgyFormValues>) => {
    onChange({ ...values, ...patch });
  };

  const isFree = values.percentage.trim() === "100";
  const disabledProps = disabled ? { disabled: true } : {};

  return (
    <>
      <s-section heading="Customer buys">
        <s-stack direction="block" gap="base">
          <s-number-field
            label="Quantity"
            value={values.buyQuantity}
            min={1}
            step={1}
            inputMode="numeric"
            {...(errors.buyQuantity ? { error: errors.buyQuantity } : {})}
            {...disabledProps}
            onInput={(event) =>
              update({ buyQuantity: event.currentTarget.value })
            }
          />

          <s-choice-list
            label="Items from"
            values={[values.buyScopeKind]}
            {...disabledProps}
            onChange={(event) => {
              const next = readChoice(event);
              if (
                next === "all" ||
                next === "products" ||
                next === "collections"
              ) {
                update({ buyScopeKind: next as BuyScopeKind });
              }
            }}
          >
            <s-choice value="products">Specific products</s-choice>
            <s-choice value="collections">Specific collections</s-choice>
            <s-choice value="all">
              Any product
              <s-text slot="details">
                Every product in the store counts toward the quantity.
              </s-text>
            </s-choice>
          </s-choice-list>

          {values.buyScopeKind === "products" && (
            <ResourceSelector
              type="product"
              selected={values.buyProducts}
              max={MAX_SCOPE_IDS}
              error={errors.buyScope}
              disabled={disabled}
              onChange={(buyProducts) => update({ buyProducts })}
            />
          )}

          {values.buyScopeKind === "collections" && (
            <ResourceSelector
              type="collection"
              selected={values.buyCollections}
              max={MAX_SCOPE_IDS}
              error={errors.buyScope}
              disabled={disabled}
              onChange={(buyCollections) => update({ buyCollections })}
            />
          )}
        </s-stack>
      </s-section>

      <s-section heading="Customer gets">
        <s-stack direction="block" gap="base">
          <s-number-field
            label="Quantity"
            value={values.getQuantity}
            min={1}
            step={1}
            inputMode="numeric"
            {...(errors.getQuantity ? { error: errors.getQuantity } : {})}
            {...disabledProps}
            onInput={(event) =>
              update({ getQuantity: event.currentTarget.value })
            }
          />

          <s-choice-list
            label="Items from"
            values={[values.getScopeKind]}
            {...disabledProps}
            onChange={(event) => {
              const next = readChoice(event);
              if (
                next === "same_as_buy" ||
                next === "products" ||
                next === "collections"
              ) {
                update({ getScopeKind: next as GetScopeKind });
              }
            }}
          >
            <s-choice value="same_as_buy">
              The same items the customer buys
              <s-text slot="details">
                For example, buy 2 shirts and get a third shirt.
              </s-text>
            </s-choice>
            <s-choice value="products">Specific products</s-choice>
            <s-choice value="collections">Specific collections</s-choice>
          </s-choice-list>

          {values.getScopeKind === "products" && (
            <ResourceSelector
              type="product"
              selected={values.getProducts}
              max={MAX_SCOPE_IDS}
              error={errors.getScope}
              disabled={disabled}
              onChange={(getProducts) => update({ getProducts })}
            />
          )}

          {values.getScopeKind === "collections" && (
            <ResourceSelector
              type="collection"
              selected={values.getCollections}
              max={MAX_SCOPE_IDS}
              error={errors.getScope}
              disabled={disabled}
              onChange={(getCollections) => update({ getCollections })}
            />
          )}

          <s-choice-list
            label="At a discounted value"
            values={[isFree ? "free" : "percentage"]}
            {...disabledProps}
            onChange={(event) => {
              const next = readChoice(event);
              if (next === "free") update({ percentage: "100" });
              // Leaving free starts from half price rather than an empty box.
              if (next === "percentage" && isFree) update({ percentage: "50" });
            }}
          >
            <s-choice value="free">Free</s-choice>
            <s-choice value="percentage">Percentage off</s-choice>
          </s-choice-list>

          {!isFree && (
            <s-number-field
              label="Percentage off"
              value={values.percentage}
              min={0}
              max={100}
              suffix="%"
              details="100% is the same as free."
              {...(errors.percentage ? { error: errors.percentage } : {})}
              {...disabledProps}
              onInput={(event) =>
                update({ percentage: event.currentTarget.value })
              }
            />
          )}

          {isFree && errors.percentage && (
            <s-text tone="critical">{errors.percentage}</s-text>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Limit">
        <s-number-field
          label="Maximum uses per order"
          value={values.maxApplications}
          min={1}
          step={1}
          inputMode="numeric"
          details="How many times the offer can repeat in one cart. Leave empty for no limit."
          {...(errors.maxApplications ? { error: errors.maxApplications } : {})}
          {...disabledProps}
          onInput={(event) =>
            update({ maxApplications: event.currentTarget.value })
          }
        />
      </s-section>

      <s-section heading="Preview">
        <s-stack direction="block" gap="small-200">
          <s-paragraph>{previewBxgy(values)}</s-paragraph>
          <s-text color="subdued">
            The discounted items are always the cheapest eligible ones in the
            cart.
          </s-text>
          {errors.size && <s-text tone="critical">{errors.size}</s-text>}
        </s-stack>
      </s-section>
    </>
  );
}

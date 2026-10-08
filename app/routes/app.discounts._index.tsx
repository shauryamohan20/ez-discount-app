import { redirect } from "react-router";

/**
 * The discounts section used to be a single page. It is now one tab per
 * discount type, so this keeps older links and bookmarks working.
 */
export const loader = () => redirect("/app/discounts/quantity");

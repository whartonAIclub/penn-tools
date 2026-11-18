"use client";

// The week's grocery list, from the plan's cooked meals, grouped by aisle.
// Ticking an item off is saved, so the list works as a shopping checklist.

import type { GroceryItem } from "@penntools/tool-penn-fitness";
import styles from "./Nutrition.module.css";

const CATEGORY_LABELS: Record<GroceryItem["category"], string> = {
  produce: "🥦 Produce",
  protein: "🍗 Protein",
  dairy: "🧀 Dairy",
  grains: "🍞 Grains & bread",
  pantry: "🥫 Pantry",
  snacks: "🥨 Snacks",
  other: "🛒 Other",
};

export function Groceries({
  items,
  checked,
  onToggle,
}: {
  items: GroceryItem[];
  /** Names of items already bought. */
  checked: string[];
  onToggle: (name: string) => void;
}) {
  if (items.length === 0) {
    return <p className={styles.description}>Nothing to buy: this week&apos;s plan has no cooked meals. 🎉</p>;
  }
  const done = items.filter((i) => checked.includes(i.name)).length;
  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <div className={styles.form}>
      <div className={styles.progress} aria-label={`${done} of ${items.length} bought`}>
        <div style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <p className={styles.meta}>
        {done === items.length ? "All done! Happy cooking 👩‍🍳" : `${done} of ${items.length} in the cart`}
      </p>
      <div className={styles.groceryGroups}>
        {categories.map((category) => (
          <div key={category} className={styles.groceryGroup}>
            <h3 className={styles.subTitle}>{CATEGORY_LABELS[category]}</h3>
            {items
              .filter((i) => i.category === category)
              .map((item) => (
                <label key={item.name} className={checked.includes(item.name) ? styles.groceryDone : styles.groceryItem}>
                  <input type="checkbox" checked={checked.includes(item.name)} onChange={() => onToggle(item.name)} />
                  <span>{item.name}</span>
                  <span className={styles.meta}>{item.quantity}</span>
                </label>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

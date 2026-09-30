import styles from "./ProfileAvatar.module.css";

/** The account's picture, or its initial when there is none. */
export function ProfileAvatar({
  name,
  image,
  size = 32,
}: {
  name: string | null;
  image: string | null;
  size?: number;
}) {
  const dimensions = { width: size, height: size };

  if (image) {
    // Plain <img>: Google avatar URLs would otherwise need next/image domain config.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={styles.avatar} style={dimensions} referrerPolicy="no-referrer" />;
  }

  return (
    <span className={`${styles.avatar} ${styles.avatarInitial}`} style={{ ...dimensions, fontSize: size * 0.45 }}>
      {(name?.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

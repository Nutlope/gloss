/** Before the first words arrive: three lines of the pen's wash, shimmering. */
export function Writing({ className = "" }: { className?: string }) {
  return (
    <div className={`writing ${className}`} role="status" aria-label="يېزىۋاتىدۇ">
      <span style={{ width: "94%" }} />
      <span style={{ width: "82%" }} />
      <span style={{ width: "58%" }} />
    </div>
  );
}

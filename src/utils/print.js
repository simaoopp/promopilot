export async function printDocument({ beforePrint, delayMs = 150 } = {}) {
  if (typeof beforePrint === "function") {
    await beforePrint();
  }

  await new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

  window.print();
}

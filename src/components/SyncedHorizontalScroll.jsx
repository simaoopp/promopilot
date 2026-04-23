import React, { useCallback, useEffect, useRef } from "react";

export default function SyncedHorizontalScroll({
  children,
  className = "",
  contentClassName = "",
}) {
  const topScrollRef = useRef(null);
  const bottomScrollRef = useRef(null);
  const spacerRef = useRef(null);
  const activeSourceRef = useRef(null);

  const updateScrollWidth = useCallback(() => {
    if (!bottomScrollRef.current || !spacerRef.current) return;

    spacerRef.current.style.width = `${bottomScrollRef.current.scrollWidth}px`;

    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    updateScrollWidth();

    const bottomNode = bottomScrollRef.current;
    if (!bottomNode) return undefined;

    const handleResize = () => updateScrollWidth();
    window.addEventListener("resize", handleResize);

    let resizeObserver;

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => updateScrollWidth());
      resizeObserver.observe(bottomNode);

      Array.from(bottomNode.children).forEach((child) => {
        resizeObserver.observe(child);
      });
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [children, updateScrollWidth]);

  function syncScroll(sourceRef, targetRef) {
    const sourceNode = sourceRef.current;
    const targetNode = targetRef.current;

    if (!sourceNode || !targetNode) return;

    if (activeSourceRef.current === targetNode) {
      activeSourceRef.current = null;
      return;
    }

    activeSourceRef.current = sourceNode;
    targetNode.scrollLeft = sourceNode.scrollLeft;
  }

  return (
    <div className={`synced-scroll-wrapper ${className}`.trim()}>
      <div
        ref={topScrollRef}
        className="synced-scrollbar synced-scrollbar-top"
        onScroll={() => syncScroll(topScrollRef, bottomScrollRef)}
        aria-hidden="true"
      >
        <div ref={spacerRef} className="synced-scrollbar-spacer" />
      </div>

      <div
        ref={bottomScrollRef}
        className={`synced-scroll-content ${contentClassName}`.trim()}
        onScroll={() => syncScroll(bottomScrollRef, topScrollRef)}
      >
        {children}
      </div>
    </div>
  );
}

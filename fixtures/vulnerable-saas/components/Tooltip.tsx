"use client";
import $ from "jquery";
import { useEffect } from "react";

export function Tooltip({ id }: { id: string }) {
  useEffect(() => {
    $(`#${id}`).fadeIn(150);
  }, [id]);
  return <span id={id} className="tooltip" role="tooltip" />;
}

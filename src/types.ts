export interface AnnotationBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Annotation {
  ref: string;
  number: number;
  role: string;
  name?: string;
  box: AnnotationBox;
}

export type Mode = "boxes" | "arrows" | "spotlight" | "flow";

export interface AnnotateOptions {
  mode: Mode;
  only?: string[];
  labels?: Record<string, string>;
  color?: string;
  dimOpacity?: number;
  padding?: number;
  minBoxSize?: number;
  frame?: number;
  frameColor?: string;
}

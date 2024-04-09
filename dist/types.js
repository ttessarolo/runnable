import Runnable from "./index.js";
export { Runnable };
export var StepType;
(function (StepType) {
    StepType["START"] = "start";
    StepType["PIPE"] = "pipe";
    StepType["ASSIGN"] = "assign";
    StepType["PASSTHROUGH"] = "passThrough";
    StepType["PICK"] = "pick";
    StepType["BRANCH"] = "branch";
    StepType["PARALLEL"] = "parallel";
    StepType["LOOP"] = "loop";
    StepType["GOTO"] = "goto";
    StepType["MILESTONE"] = "milestone";
    StepType["END"] = "end";
})(StepType || (StepType = {}));
export class IteratorError extends Error {
    constructor(message) {
        super(message);
        this.name = "IterateError";
    }
}

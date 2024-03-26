import Runnable from "./index.js";
export { Runnable };
export var StepType;
(function (StepType) {
    StepType["INIT"] = "init";
    StepType["PIPE"] = "pipe";
    StepType["ASSIGN"] = "assign";
    StepType["PASSTHROUGH"] = "passThrough";
    StepType["PICK"] = "pick";
    StepType["BRANCH"] = "branch";
    StepType["PARALLEL"] = "parallel";
    StepType["LOOP"] = "loop";
    StepType["GOTO"] = "goto";
    StepType["MILESTONE"] = "milestone";
})(StepType || (StepType = {}));

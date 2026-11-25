import test from "node:test";
import assert from "node:assert/strict";
import { mean, stddev, zScore, weightedScore, pctChange } from "../src/math.js";
test("mean and stddev",()=>{assert.equal(mean([1,2,3]),2);assert.ok(Math.abs(stddev([1,2,3])-0.81649658)<1e-6);});
test("zscore waits for baseline",()=>{assert.equal(zScore(10,[1,2]).ready,false);assert.ok(zScore(10,Array(20).fill(5)).ready);});
test("weighted score normalized to 100",()=>{assert.equal(weightedScore([{score:1,weight:50},{score:0,weight:50}]),50);});
test("percent change",()=>{assert.equal(pctChange(100,102),2);});

# Causal Experiments Protocol

1. **Hypothesis Formulation**:
   - Explicitly link observed delay to a named operation/component.
   - Example: "Consolidating hero CSS eliminates secondary round-trip blocking FCP".
2. **Controlled Isolation**:
   - Counterfactual branch or test harness.
   - Change only one variable at a time.
   - If change fails to produce statistically significant improvement, revert immediately.
3. **Outcome Classification**:
   - `HYPOTHESIS_CONFIRMED`
   - `HYPOTHESIS_REJECTED`
   - `IMPROVEMENT_CONFIRMED`
   - `NO_MEASURABLE_IMPROVEMENT`
   - `REGRESSION_FOUND`
   - `INCONCLUSIVE`

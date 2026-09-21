"""Test root, deliberately a regular package.

Without this file `tests` is a namespace package, and Python resolves a REGULAR
package found anywhere on sys.path ahead of a namespace portion - regardless of
sys.path order, so PYTHONPATH cannot win. Several third-party distributions
(speechrecognition, textstat) install a top-level `tests/__init__.py` into
site-packages, which then shadows this directory entirely and makes the
pipeline's own invocation, `python -m unittest tests.upgrade.<name>`, fail with
ModuleNotFoundError on any machine that has them installed.
"""

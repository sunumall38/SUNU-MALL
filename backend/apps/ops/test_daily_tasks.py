"""Commande `run_daily_tasks` : traitements quotidiens sans worker ni Celery Beat."""
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from apps.ops.management.commands import run_daily_tasks as module
from apps.ops.models import SystemSetting


class RunDailyTasksTests(TestCase):
    def run_command(self, *args):
        out = StringIO()
        call_command("run_daily_tasks", *args, stdout=out)
        return out.getvalue()

    def patched_tasks(self, first=None, second=None):
        return patch.object(module, "DAILY_TASKS", [("premier", first), ("second", second)])

    def last_run(self):
        return SystemSetting.objects.get(key=module.LAST_RUN_KEY).value

    def test_real_tasks_run_on_an_empty_database(self):
        output = self.run_command()
        self.assertIn("expire_and_remind_subscriptions : terminé", output)
        self.assertIn("release_pending_funds : terminé", output)
        self.assertEqual(self.last_run(), timezone.localdate().isoformat())

    def test_if_due_runs_only_once_a_day(self):
        calls = []
        with self.patched_tasks(lambda: calls.append(1), lambda: calls.append(2)):
            self.run_command("--if-due")
            output = self.run_command("--if-due")
        self.assertEqual(calls, [1, 2])
        self.assertIn("rien à faire", output)

    def test_if_due_runs_again_the_next_day(self):
        calls = []
        with self.patched_tasks(lambda: calls.append(1), lambda: calls.append(2)):
            self.run_command("--if-due")
            SystemSetting.objects.filter(key=module.LAST_RUN_KEY).update(value="2026-01-01")
            self.run_command("--if-due")
        self.assertEqual(calls, [1, 2, 1, 2])

    def test_without_if_due_always_runs(self):
        calls = []
        with self.patched_tasks(lambda: calls.append(1), lambda: calls.append(2)):
            self.run_command()
            self.run_command()
        self.assertEqual(calls, [1, 2, 1, 2])

    def test_a_failing_task_does_not_block_the_other_and_is_retried(self):
        calls = []

        def broken():
            raise RuntimeError("fournisseur email indisponible")

        with self.patched_tasks(broken, lambda: calls.append(2)):
            with self.assertLogs(module.logger, level="ERROR"), self.assertRaises(CommandError):
                self.run_command("--if-due")
        self.assertEqual(calls, [2])
        # La journée n'est pas marquée faite : le prochain démarrage réessaie.
        self.assertIsNone(self.last_run())
        with self.patched_tasks(lambda: calls.append(1), lambda: calls.append(2)):
            self.run_command("--if-due")
        self.assertEqual(calls, [2, 1, 2])

"""Traitements quotidiens déclenchés par le trafic (apps/ops/middleware.py)."""
from unittest import mock

from django.test import RequestFactory, SimpleTestCase, override_settings

from apps.ops import middleware


class DailyTasksMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.request = RequestFactory().get("/api/catalog/products/")
        self.middleware = middleware.DailyTasksMiddleware(lambda request: "réponse")

    @override_settings(DAILY_TASKS_ON_REQUESTS=True, DAILY_TASKS_CHECK_INTERVAL=3600)
    def test_launches_at_most_once_per_interval(self):
        with mock.patch.object(middleware, "threading") as threading, mock.patch.object(middleware, "time") as clock:
            clock.monotonic.side_effect = [100.0, 200.0, 3800.0]
            responses = [self.middleware(self.request) for _ in range(3)]

        self.assertEqual(responses, ["réponse"] * 3)
        # 1re requête, puis une heure plus tard ; rien entre les deux.
        self.assertEqual(threading.Thread.call_count, 2)
        threading.Thread.return_value.start.assert_called()

    @override_settings(DAILY_TASKS_ON_REQUESTS=False)
    def test_disabled_by_default(self):
        with mock.patch.object(middleware, "threading") as threading:
            self.middleware(self.request)
        threading.Thread.assert_not_called()

    def test_failure_never_reaches_the_web_process(self):
        with mock.patch.object(middleware, "call_command", side_effect=RuntimeError("base indisponible")) as command, \
                mock.patch.object(middleware, "connections") as connections:
            middleware._run_daily_tasks()
        command.assert_called_once_with("run_daily_tasks", if_due=True, verbosity=0)
        connections.close_all.assert_called_once()

import base64
from email import policy
from email.parser import BytesParser
from unittest.mock import Mock, call, patch

import requests
from django.core.mail import EmailMultiAlternatives
from django.test import SimpleTestCase, override_settings

from config.email_backends import GmailApiEmailBackend, GmailApiError


GMAIL_SETTINGS = {
    "GMAIL_CLIENT_ID": "client-id",
    "GMAIL_CLIENT_SECRET": "client-secret",
    "GMAIL_REFRESH_TOKEN": "refresh-token",
    "GMAIL_TOKEN_URL": "https://oauth.example/token",
    "GMAIL_SEND_URL": "https://gmail.example/messages/send",
    "EMAIL_TIMEOUT": 9,
}


@override_settings(**GMAIL_SETTINGS)
class GmailApiEmailBackendTests(SimpleTestCase):
    @patch("config.email_backends.requests.post")
    def test_sends_django_html_email_over_https(self, mocked_post):
        token_response = Mock()
        token_response.json.return_value = {"access_token": "access-token"}
        send_response = Mock()
        mocked_post.side_effect = [token_response, send_response]

        message = EmailMultiAlternatives(
            subject="Activation SUNU MALL",
            body="Activez votre compte.",
            from_email="SUNU MALL <sunumall38@gmail.com>",
            to=["client@example.com"],
        )
        message.attach_alternative("<p>Activez votre compte.</p>", "text/html")

        sent = GmailApiEmailBackend().send_messages([message])

        self.assertEqual(sent, 1)
        self.assertEqual(mocked_post.call_count, 2)
        mocked_post.assert_has_calls([
            call(
                "https://oauth.example/token",
                data={
                    "client_id": "client-id",
                    "client_secret": "client-secret",
                    "refresh_token": "refresh-token",
                    "grant_type": "refresh_token",
                },
                timeout=9,
            ),
            call(
                "https://gmail.example/messages/send",
                headers={
                    "Authorization": "Bearer access-token",
                    "Accept": "application/json",
                },
                json={"raw": mocked_post.call_args.kwargs["json"]["raw"]},
                timeout=9,
            ),
        ])

        raw = mocked_post.call_args.kwargs["json"]["raw"]
        parsed = BytesParser(policy=policy.default).parsebytes(base64.urlsafe_b64decode(raw))
        self.assertEqual(parsed["To"], "client@example.com")
        self.assertEqual(parsed["From"], "SUNU MALL <sunumall38@gmail.com>")
        self.assertEqual(parsed["Subject"], "Activation SUNU MALL")
        self.assertTrue(parsed.is_multipart())

    @patch("config.email_backends.requests.post")
    def test_uses_one_access_token_for_a_batch(self, mocked_post):
        token_response = Mock()
        token_response.json.return_value = {"access_token": "access-token"}
        mocked_post.side_effect = [token_response, Mock(), Mock()]
        messages = [
            EmailMultiAlternatives("Sujet", "Message", "sender@gmail.com", [recipient])
            for recipient in ("one@example.com", "two@example.com")
        ]

        sent = GmailApiEmailBackend().send_messages(messages)

        self.assertEqual(sent, 2)
        self.assertEqual(mocked_post.call_count, 3)

    @patch("config.email_backends.requests.post")
    def test_raises_a_safe_error_when_token_refresh_fails(self, mocked_post):
        mocked_post.side_effect = requests.ConnectionError("secret provider detail")
        message = EmailMultiAlternatives(
            "Sujet", "Message", "sender@gmail.com", ["client@example.com"]
        )

        with self.assertRaisesMessage(GmailApiError, "jeton d'accès Gmail"):
            GmailApiEmailBackend(fail_silently=False).send_messages([message])

    @patch("config.email_backends.requests.post")
    def test_fail_silently_returns_zero(self, mocked_post):
        mocked_post.side_effect = requests.ConnectionError("offline")
        message = EmailMultiAlternatives(
            "Sujet", "Message", "sender@gmail.com", ["client@example.com"]
        )

        sent = GmailApiEmailBackend(fail_silently=True).send_messages([message])

        self.assertEqual(sent, 0)

    @patch("config.email_backends.requests.post")
    def test_does_not_request_token_without_recipients(self, mocked_post):
        message = EmailMultiAlternatives("Sujet", "Message", "sender@gmail.com", [])

        sent = GmailApiEmailBackend().send_messages([message])

        self.assertEqual(sent, 0)
        mocked_post.assert_not_called()

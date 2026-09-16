from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from .storage import _s3_storage


class KycS3StorageSettingsTests(SimpleTestCase):
    @override_settings(
        KYC_S3_ACCESS_KEY="kyc-access",
        KYC_S3_SECRET_KEY="kyc-secret",
        KYC_S3_ENDPOINT="https://storage.example",
        KYC_S3_REGION="auto",
        KYC_S3_ADDRESSING_STYLE="virtual",
        KYC_STORAGE_BUCKET="kyc-private",
        KYC_PRESIGNED_URL_TTL=300,
    )
    @patch("storages.backends.s3boto3.S3Boto3Storage")
    def test_uses_dedicated_kyc_credentials(self, storage_class):
        _s3_storage()

        storage_class.assert_called_once_with(
            access_key="kyc-access",
            secret_key="kyc-secret",
            endpoint_url="https://storage.example",
            region_name="auto",
            addressing_style="virtual",
            signature_version="s3v4",
            bucket_name="kyc-private",
            default_acl=None,
            file_overwrite=False,
            querystring_auth=True,
            querystring_expire=300,
            custom_domain=None,
        )

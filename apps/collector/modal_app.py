import modal

from collector import APP_NAME, register_collector

app = modal.App(APP_NAME)
Collector = register_collector(app, modal.Secret.from_name(APP_NAME))

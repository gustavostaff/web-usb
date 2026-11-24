"""Gera tests/fixtures/<caso>.bin com o layout 1 do print server (Python).

Rode com o Python do print server, depois de mudar o layout de um dos lados:
    ../smarts_hub_totem_campaign_print_server/.venv/bin/python tests/make_fixtures.py
"""

import json
import logging
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "smarts_hub_totem_campaign_print_server"))

from print_server.config import Settings  # noqa: E402
from print_server.printer import PrinterService  # noqa: E402
from print_server.schemas import Coupon  # noqa: E402

logging.disable(logging.WARNING)


def main() -> None:
    service = PrinterService(Settings(printer_type="dummy"))
    target = HERE / "fixtures"
    target.mkdir(exist_ok=True)
    for case in json.loads((HERE / "cases.json").read_text(encoding="utf-8")):
        data = service.render(Coupon(**case["coupon"]), case["vias"])
        (target / f"{case['name']}.bin").write_bytes(data)
        print(f"{case['name']}: {len(data)} bytes")


if __name__ == "__main__":
    main()

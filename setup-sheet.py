"""Görüş cədvəlini BİR DƏFƏ yaradır.

İşə salmazdan əvvəl: interfeysdə 'GOOGLE QOŞ' düyməsinə bas - cədvəl üçün
yeni icazə (drive.file) əlavə olundu, köhnə token onu daşımır.

Bu skript yazma əməliyyatı edən yeganə yerdir. VISION-un özü cədvələ yaza
bilmir: alət siyahısında yalnız oxuyan meetings() var.
"""
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import google_tools

try:
    print(google_tools.create_meetings_sheet())
except google_tools.GoogleError as exc:
    print("Alınmadı:", exc)
    sys.exit(1)

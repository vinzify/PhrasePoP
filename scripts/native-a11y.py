"""Exercise only the disposable PhrasePoP process passed by native-smoke.mjs."""
import sys
import time
import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

process_id = int(sys.argv[1])


def application():
    desktop = Atspi.get_desktop(0)
    for index in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(index)
        if app.get_process_id() == process_id:
            return app
    return None


def descendants(node, depth=0):
    if node is None or depth > 24:
        return
    yield node
    for index in range(min(node.get_child_count(), 200)):
        child = node.get_child_at_index(index)
        if child is not None:
            yield from descendants(child, depth + 1)


def wait_for(predicate, description):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        try:
            for node in descendants(application()):
                if predicate(node):
                    return node
        except Exception:
            pass
        time.sleep(0.15)
    raise RuntimeError("Native accessibility check failed: " + description)


def named(name):
    return wait_for(lambda node: node.get_name() == name, name)


def text(node):
    value = node.get_name()
    interface = node.get_text_iface()
    if interface is not None:
        value += Atspi.Text.get_text(interface, 0, min(Atspi.Text.get_character_count(interface), 10000))
    return value


def click(name):
    node = wait_for(lambda node: node.get_name() == name and node.get_action_iface() is not None and node.get_state_set().contains(Atspi.StateType.SENSITIVE), name)
    if not node.get_action_iface().do_action(0):
        raise RuntimeError("Could not activate " + name)


click("Settings")
named("Appearance")
wait_for(lambda node: "Dark · default" in text(node), "dark default preference")
wait_for(lambda node: "phrasepop --clipboard" in text(node), "Wayland desktop guidance")
click("Close settings")
named("Improve this text")
print("Native WebKit UI loaded, opened/closed Settings, and showed Dark as the default with Wayland workflow guidance.")
print("This WebKit AT-SPI implementation does not expose EditableText for the form fields; native provider submission remains a manual check.")
